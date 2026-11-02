mock_provider "aws" {
  mock_data "aws_region" {
    defaults = {
      region = "us-east-1"
    }
  }
}

variables {
  name_prefix                       = "example-site"
  metric_namespace                  = "ExampleSite"
  alarm_topic_arn                   = "arn:aws:sns:us-east-1:123456789012:example-site-alerts"
  episodes_log_group_name           = "/example-site/availability-episodes"
  spot_interruptions_log_group_name = "/aws/events/example-site-spot-interruptions"
  backup_enabled                    = false
}

run "percent_mode_defaults" {
  command = plan

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.disk_used) == 1
    error_message = "Disk alarm is on by default"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.disk_used[0].alarm_name == "example-site-disk-used"
    error_message = "Disk alarm name"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.disk_used[0].threshold == 85
    error_message = "Default threshold"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.disk_used[0].treat_missing_data == "notBreaching"
    error_message = "Percent mode treats missing data as not breaching"
  }

  assert {
    condition = (
      aws_cloudwatch_metric_alarm.disk_used[0].alarm_actions == toset(["arn:aws:sns:us-east-1:123456789012:example-site-alerts"])
      && aws_cloudwatch_metric_alarm.disk_used[0].ok_actions == toset(["arn:aws:sns:us-east-1:123456789012:example-site-alerts"])
    )
    error_message = "Alarm and OK actions must both be the supplied topic"
  }

  assert {
    condition = (
      length(aws_cloudwatch_metric_alarm.disk_used[0].metric_query) == 1
      && one(aws_cloudwatch_metric_alarm.disk_used[0].metric_query).metric[0].metric_name == "DiskUsedPercent"
      && one(aws_cloudwatch_metric_alarm.disk_used[0].metric_query).metric[0].namespace == "ExampleSite"
    )
    error_message = "Percent mode reads DiskUsedPercent from metric_namespace"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.disk_root_used) == 0
    error_message = "No root alarm without volume metrics"
  }
}

run "threshold_and_period_are_variables" {
  command = plan

  variables {
    disk_alarm_used_percent   = 90
    disk_alarm_period_seconds = 7200
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.disk_used[0].threshold == 90
    error_message = "Threshold variable"
  }

  assert {
    condition     = one(aws_cloudwatch_metric_alarm.disk_used[0].metric_query).metric[0].period == 7200
    error_message = "Period variable"
  }
}

run "host_metrics_off_drops_alarms" {
  command = plan

  variables {
    host_metrics_enabled   = false
    volume_metrics_enabled = true
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.disk_used) == 0 && length(aws_cloudwatch_metric_alarm.disk_root_used) == 0
    error_message = "No disk alarms without host metrics"
  }
}

run "volume_mode_uses_byte_pair" {
  command = plan

  variables {
    volume_metrics_enabled = true
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.disk_used[0].treat_missing_data == "ignore"
    error_message = "Volume mode ignores missing data"
  }

  assert {
    condition = (
      length(aws_cloudwatch_metric_alarm.disk_used[0].metric_query) == 3
      && contains([for q in aws_cloudwatch_metric_alarm.disk_used[0].metric_query : q.expression], "100 * used / total")
    )
    error_message = "Volume mode computes percent from used and total"
  }

  assert {
    condition = alltrue([
      for q in aws_cloudwatch_metric_alarm.disk_used[0].metric_query :
      length(q.metric) == 0 || q.metric[0].dimensions["Mount"] == "data"
    ])
    error_message = "Volume mode reads Mount=data"
  }

  assert {
    condition = toset([
      for q in aws_cloudwatch_metric_alarm.disk_used[0].metric_query : q.metric[0].metric_name if length(q.metric) > 0
    ]) == toset(["DiskUsedBytes", "DiskTotalBytes"])
    error_message = "Volume mode metric names"
  }
}

run "root_alarm_is_opt_in" {
  command = plan

  variables {
    volume_metrics_enabled = true
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.disk_root_used) == 0
    error_message = "Root alarm is off by default"
  }
}

run "volume_mode_adds_root_alarm" {
  command = plan

  variables {
    volume_metrics_enabled  = true
    root_disk_alarm_enabled = true
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.disk_root_used[0].alarm_name == "example-site-disk-root-used"
    error_message = "Root alarm name"
  }

  assert {
    condition = alltrue([
      for q in aws_cloudwatch_metric_alarm.disk_root_used[0].metric_query :
      length(q.metric) == 0 || q.metric[0].dimensions["Mount"] == "root"
    ])
    error_message = "Root alarm reads Mount=root"
  }

  assert {
    condition = (
      aws_cloudwatch_metric_alarm.disk_root_used[0].treat_missing_data == "ignore"
      && aws_cloudwatch_metric_alarm.disk_root_used[0].ok_actions == toset(["arn:aws:sns:us-east-1:123456789012:example-site-alerts"])
    )
    error_message = "Root alarm matches data alarm behavior"
  }
}

run "root_alarm_needs_volume_metrics" {
  command = plan

  variables {
    root_disk_alarm_enabled = true
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.disk_root_used) == 0
    error_message = "Root alarm requires volume metrics"
  }
}

run "alarm_names_output" {
  command = plan

  variables {
    volume_metrics_enabled  = true
    root_disk_alarm_enabled = true
  }

  assert {
    condition     = join(",", output.alarm_names) == "example-site-disk-used,example-site-disk-root-used"
    error_message = "alarm_names lists every disk alarm"
  }
}

run "alarm_names_empty_without_host_metrics" {
  command = plan

  variables {
    host_metrics_enabled = false
  }

  assert {
    condition     = length(output.alarm_names) == 0
    error_message = "alarm_names is empty without host metrics"
  }
}
