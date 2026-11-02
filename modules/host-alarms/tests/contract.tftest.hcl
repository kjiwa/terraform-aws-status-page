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
  backup_enabled                    = true
}

run "names_derive_from_prefix" {
  command = plan

  assert {
    condition     = aws_cloudwatch_event_rule.backup_failure[0].name == "example-site-backup-failure"
    error_message = "Backup failure rule name"
  }

  assert {
    condition     = aws_cloudwatch_event_target.backup_failure[0].arn == "arn:aws:sns:us-east-1:123456789012:example-site-alerts"
    error_message = "Backup failure target must be the supplied topic"
  }

  assert {
    condition     = aws_cloudwatch_dashboard.availability.dashboard_name == "example-site-availability"
    error_message = "Dashboard name"
  }

  assert {
    condition = alltrue([
      aws_cloudwatch_query_definition.downtime_by_cause.name == "example-site/downtime-by-cause",
      aws_cloudwatch_query_definition.episodes.name == "example-site/outage-episodes",
      aws_cloudwatch_query_definition.interruptions_per_week.name == "example-site/spot-interruptions-per-week",
    ])
    error_message = "Query definition names"
  }

  assert {
    condition     = aws_cloudwatch_query_definition.episodes.log_group_names == tolist(["/example-site/availability-episodes"])
    error_message = "Episodes query log group"
  }
}

run "dashboard_uses_namespace" {
  command = plan

  assert {
    condition     = strcontains(aws_cloudwatch_dashboard.availability.dashboard_body, "\"ExampleSite\",\"SiteUp\"")
    error_message = "Dashboard must read SiteUp from metric_namespace"
  }

  assert {
    condition     = strcontains(aws_cloudwatch_dashboard.availability.dashboard_body, "/aws/events/example-site-spot-interruptions")
    error_message = "Dashboard must query the Spot log group"
  }
}

run "backup_disabled_drops_alert" {
  command = plan

  variables {
    backup_enabled = false
  }

  assert {
    condition     = length(aws_cloudwatch_event_rule.backup_failure) == 0 && length(aws_cloudwatch_event_target.backup_failure) == 0
    error_message = "Backup alert must not exist when backup is disabled"
  }
}

run "backup_alert_filters_failed_and_expired" {
  command = plan

  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.backup_failure[0].event_pattern).detail.state == ["FAILED", "EXPIRED"]
    error_message = "Backup alert states"
  }
}
