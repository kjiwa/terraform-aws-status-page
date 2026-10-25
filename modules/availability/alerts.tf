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

# "Down" = 2 of the last 3 minutes failed; "recovered" = 3 clean minutes.
# Outages shorter than ~2 min never alarm (deliberate: a reclaim with instant
# replacement capacity still takes 4+ min of boot/deploy, so every real Spot
# outage is caught, while single-probe network blips are not). Missing data
# is breaching: if the metric source itself stops reporting, that is
# indistinguishable from "unknown" and should be loud.
resource "aws_cloudwatch_metric_alarm" "site_down" {
  alarm_name          = "${var.name_prefix}-site-down"
  alarm_description   = "Cannot reach https://${var.primary_domain}/."
  namespace           = var.metric_namespace
  metric_name         = "SiteUp"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  datapoints_to_alarm = 2
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
  # Disabled while the env sleeps: the alarm breaches by design (no canary
  # data) and must not email anyone about it.
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
