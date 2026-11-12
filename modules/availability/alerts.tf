# Publishers: the availability Lambda (IAM-authorized, same account), EventBridge
# rules in this account, and the CloudWatch alarms named in var.alarm_publishers;
# the last two publish as service principals, not IAM identities, so they need
# the topic policy below.
resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts"

  tags = {
    Name = "${var.name_prefix}-alerts"
  }
}

# Scoped to this account's resources.
data "aws_iam_policy_document" "alerts_topic" {
  statement {
    sid       = "AllowEventBridgePublish"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }

  dynamic "statement" {
    for_each = length(var.alarm_publishers) > 0 ? [1] : []
    content {
      sid       = "AllowAlarmPublish"
      effect    = "Allow"
      actions   = ["sns:Publish"]
      resources = [aws_sns_topic.alerts.arn]
      principals {
        type        = "Service"
        identifiers = ["cloudwatch.amazonaws.com"]
      }
      condition {
        test     = "ArnEquals"
        variable = "aws:SourceArn"
        values   = [for n in var.alarm_publishers : "arn:aws:cloudwatch:${data.aws_region.current.region}:${local.account_id}:alarm:${n}"]
      }
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts_topic.json
}

# Pending until the confirmation email is clicked; nothing is delivered before.
resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# "Down" = datapoints_to_alarm of the last evaluation_periods minutes failed
# (default 2 of 3, which ignores a single-probe blip; 1 of 3 alarms on any
# bad minute). Recovery needs evaluation_periods clean minutes. CloudWatch
# ignores treat_missing_data while enough real datapoints exist in its
# evaluation range, so a silent minute counts only because the heartbeat
# backfill (or the canary) writes an explicit 0, so a silent
# publisher alarms about 3 minutes after it stops (2 of lag, then the evaluation). Missing data is breaching
# for the rest: a metric source that stops reporting is loud.
resource "aws_cloudwatch_metric_alarm" "site_down" {
  alarm_name          = "${var.name_prefix}-site-down"
  alarm_description   = var.canary_enabled ? "Cannot reach https://${var.primary_domain}/." : "No SiteUp heartbeat from ${var.primary_domain}."
  namespace           = var.metric_namespace
  metric_name         = "SiteUp"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = var.site_down_alarm.evaluation_periods
  datapoints_to_alarm = var.site_down_alarm.datapoints_to_alarm
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  # Notifications go through the Lambda (via the state-change rule below) so
  # they can carry cause + duration; no direct alarm actions.

  tags = {
    Name = "${var.name_prefix}-site-down"
  }
}

resource "aws_cloudwatch_event_rule" "alarm_state" {
  name        = "${var.name_prefix}-availability-alarm-state"
  description = "Routes site-down alarm transitions to the availability Lambda for enriched DOWN/RECOVERED emails."
  # Disabled while the env sleeps: the alarm breaches by design (no
  # datapoints) and must not email anyone about it.
  state = var.active ? "ENABLED" : "DISABLED"

  event_pattern = jsonencode({
    source        = ["aws.cloudwatch"]
    "detail-type" = ["CloudWatch Alarm State Change"]
    detail = {
      alarmName = [aws_cloudwatch_metric_alarm.site_down.alarm_name]
      state = {
        value = ["ALARM", "OK"]
      }
    }
  })

  tags = {
    Name = "${var.name_prefix}-availability-alarm-state"
  }
}

resource "aws_cloudwatch_event_target" "alarm_state" {
  rule      = aws_cloudwatch_event_rule.alarm_state.name
  target_id = "availability-lambda"
  arn       = aws_lambda_function.availability.arn
}

resource "aws_lambda_permission" "alarm_state" {
  statement_id  = "AllowAlarmStateRule"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.availability.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.alarm_state.arn
}
