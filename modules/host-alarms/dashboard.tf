data "aws_region" "current" {}

# The episodes stream of modules/availability; the log group also holds its
# `changes` stream, which is not an outage record.
locals {
  episodes_stream_filter = "filter @logStream = \"episodes\""
}

# The "what is Spot costing me" view. Availability % is just AVG(SiteUp) over
# whatever time range the dashboard is set to (default 30 days).

resource "aws_cloudwatch_dashboard" "availability" {
  dashboard_name = "${var.name_prefix}-availability"

  dashboard_body = jsonencode({
    start = "-P30D"
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 6
        height = 6
        properties = {
          title  = "Availability %"
          region = data.aws_region.current.region
          view   = "singleValue"
          metrics = [
            [{ expression = "100*AVG(m1)", label = "availability", id = "e1" }],
            [var.metric_namespace, "SiteUp", { id = "m1", stat = "Average", visible = false }],
          ]
          period               = 60
          setPeriodToTimeRange = true
        }
      },
      {
        type   = "metric"
        x      = 6
        y      = 0
        width  = 18
        height = 6
        properties = {
          title  = "SiteUp (dips = outages)"
          region = data.aws_region.current.region
          view   = "timeSeries"
          metrics = [
            [var.metric_namespace, "SiteUp", { stat = "Minimum", period = 300 }],
          ]
          yAxis = { left = { min = 0, max = 1 } }
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Canary latency (ms)"
          region = data.aws_region.current.region
          view   = "timeSeries"
          metrics = [
            [var.metric_namespace, "LatencyMs", { stat = "p50", period = 3600 }],
            [var.metric_namespace, "LatencyMs", { stat = "p90", period = 3600 }],
          ]
        }
      },
      {
        type   = "log"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Spot interruptions per week"
          region = data.aws_region.current.region
          view   = "bar"
          query  = "SOURCE '${var.spot_interruptions_log_group_name}' | stats count(*) as interruptions by bin(1w)"
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 12
        width  = 24
        height = 6
        properties = {
          title  = "Recent outage episodes"
          region = data.aws_region.current.region
          view   = "table"
          query  = "SOURCE '${var.episodes_log_group_name}' | ${local.episodes_stream_filter} | fields @timestamp, cause, duration_s, new_instance.type, new_instance.az | sort @timestamp desc | limit 20"
        }
      },
    ]
  })
}

# Saved Logs Insights queries: the on-demand answers to "what did Spot cost me
# this month". Run from the Logs Insights console with any time range.

resource "aws_cloudwatch_query_definition" "downtime_by_cause" {
  name            = "${var.name_prefix}/downtime-by-cause"
  log_group_names = [var.episodes_log_group_name]
  query_string    = <<-EOT
    ${local.episodes_stream_filter}
    | fields cause, duration_s
    | stats count(*) as outages, sum(duration_s) / 60 as downtime_minutes, avg(duration_s) / 60 as avg_minutes, max(duration_s) / 60 as worst_minutes by cause
  EOT
}

resource "aws_cloudwatch_query_definition" "episodes" {
  name            = "${var.name_prefix}/outage-episodes"
  log_group_names = [var.episodes_log_group_name]
  query_string    = <<-EOT
    ${local.episodes_stream_filter}
    | fields started, ended, duration_s, cause, old_instance.type, new_instance.type, new_instance.az
    | sort @timestamp desc
  EOT
}

resource "aws_cloudwatch_query_definition" "interruptions_per_week" {
  name            = "${var.name_prefix}/spot-interruptions-per-week"
  log_group_names = [var.spot_interruptions_log_group_name]
  query_string    = <<-EOT
    stats count(*) as interruptions by bin(1w)
  EOT
}
