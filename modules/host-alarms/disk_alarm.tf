locals {
  data_alarm_name = "${var.name_prefix}-disk-used"
  root_alarm_name = "${var.name_prefix}-disk-root-used"

  root_alarm_enabled = var.host_metrics_enabled && var.volume_metrics_enabled && var.root_disk_alarm_enabled

  alarm_names = concat(
    var.host_metrics_enabled ? [local.data_alarm_name] : [],
    local.root_alarm_enabled ? [local.root_alarm_name] : [],
  )

  # The byte-pair publisher is silent while the environment sleeps and on an
  # AMI predating the series. "notBreaching" would report OK on a dead
  # publisher and, with ok_actions, mail on every wake; "breaching" would page
  # on every sleep. DiskUsedPercent comes from an always-on host whose death
  # the site-down alarm already covers, so there missing data is not breaching.
  disk_treat_missing_data = var.volume_metrics_enabled ? "ignore" : "notBreaching"
}

# Data volume above the threshold. With volume_metrics_enabled the percent is
# computed from DiskUsedBytes/DiskTotalBytes for Mount=data; otherwise it is
# the publisher's DiskUsedPercent.
resource "aws_cloudwatch_metric_alarm" "disk_used" {
  count = var.host_metrics_enabled ? 1 : 0

  alarm_name          = local.data_alarm_name
  alarm_description   = "Data volume is above ${var.disk_alarm_used_percent}% used."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = var.disk_alarm_used_percent
  treat_missing_data  = local.disk_treat_missing_data
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]

  dynamic "metric_query" {
    for_each = var.volume_metrics_enabled ? [1] : []
    content {
      id          = "pct"
      expression  = "100 * used / total"
      label       = "Data volume used (%)"
      return_data = true
    }
  }

  dynamic "metric_query" {
    for_each = var.volume_metrics_enabled ? ["used", "total"] : []
    content {
      id = metric_query.value
      metric {
        namespace   = var.metric_namespace
        metric_name = metric_query.value == "used" ? "DiskUsedBytes" : "DiskTotalBytes"
        dimensions  = { Mount = "data" }
        stat        = "Maximum"
        period      = var.disk_alarm_period_seconds
      }
    }
  }

  dynamic "metric_query" {
    for_each = var.volume_metrics_enabled ? [] : [1]
    content {
      id          = "pct"
      label       = "Data volume used (%)"
      return_data = true
      metric {
        namespace   = var.metric_namespace
        metric_name = "DiskUsedPercent"
        stat        = "Maximum"
        period      = var.disk_alarm_period_seconds
      }
    }
  }

  tags = {
    Name = local.data_alarm_name
  }
}

resource "aws_cloudwatch_metric_alarm" "disk_root_used" {
  count = local.root_alarm_enabled ? 1 : 0

  alarm_name          = local.root_alarm_name
  alarm_description   = "Root volume is above ${var.disk_alarm_used_percent}% used."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = var.disk_alarm_used_percent
  treat_missing_data  = local.disk_treat_missing_data
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]

  metric_query {
    id          = "pct"
    expression  = "100 * used / total"
    label       = "Root volume used (%)"
    return_data = true
  }

  dynamic "metric_query" {
    for_each = ["used", "total"]
    content {
      id = metric_query.value
      metric {
        namespace   = var.metric_namespace
        metric_name = metric_query.value == "used" ? "DiskUsedBytes" : "DiskTotalBytes"
        dimensions  = { Mount = "root" }
        stat        = "Maximum"
        period      = var.disk_alarm_period_seconds
      }
    }
  }

  tags = {
    Name = local.root_alarm_name
  }
}
