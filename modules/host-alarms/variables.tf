variable "name_prefix" {
  description = "Prefix for every resource name: <prefix>-backup-failure, <prefix>-availability, <prefix>-disk-used, <prefix>-disk-root-used, and the <prefix>/ saved query names."
  type        = string
}

variable "metric_namespace" {
  description = "CloudWatch namespace the canary and the host publisher write to. The dashboard reads SiteUp and LatencyMs from it and the disk alarms read the disk metrics from it."
  type        = string
}

variable "alarm_topic_arn" {
  description = "SNS topic that receives backup failures and disk alarm transitions, normally modules/availability's sns_topic_arn. Its policy must allow events.amazonaws.com to publish, or backup failure events are dropped without an error."
  type        = string
}

variable "episodes_log_group_name" {
  description = "Log group holding the outage episodes, from modules/availability. Read by the dashboard and the saved queries."
  type        = string
}

variable "spot_interruptions_log_group_name" {
  description = "Log group holding raw Spot interruption warnings, from modules/availability. Read by the dashboard and the saved queries."
  type        = string
}

variable "backup_enabled" {
  description = "Whether AWS Backup is running. Gates the backup-failure alert rule."
  type        = bool
}

variable "host_metrics_enabled" {
  description = "Whether the instance publishes disk metrics to metric_namespace. Gates every disk alarm."
  type        = bool
  default     = true
}

variable "volume_metrics_enabled" {
  description = "Whether the instance publishes the DiskUsedBytes/DiskTotalBytes pair, dimensioned by Mount, instead of DiskUsedPercent. Selects the disk alarm's metric source and, because the pair can be silent while the host sleeps, makes missing data ignored rather than not breaching."
  type        = bool
  default     = false
}

variable "root_disk_alarm_enabled" {
  description = "Whether to add a second alarm on the Mount=root series. Requires volume_metrics_enabled; DiskUsedPercent has no per-mount series."
  type        = bool
  default     = false

  validation {
    condition     = !var.root_disk_alarm_enabled || var.volume_metrics_enabled
    error_message = "The root disk alarm reads the Mount=root byte series, so root_disk_alarm_enabled requires volume_metrics_enabled."
  }
}

variable "disk_alarm_used_percent" {
  description = "Used-space percentage above which the disk alarms fire."
  type        = number
  default     = 85

  validation {
    condition     = var.disk_alarm_used_percent > 0 && var.disk_alarm_used_percent < 100
    error_message = "disk_alarm_used_percent must be greater than 0 and less than 100."
  }
}

variable "disk_alarm_period_seconds" {
  description = "Evaluation period of the disk alarms. Set it to at least twice the publish interval so a drifting timer never leaves an empty bucket."
  type        = number
  default     = 900

  validation {
    condition     = var.disk_alarm_period_seconds >= 60 && var.disk_alarm_period_seconds % 60 == 0
    error_message = "disk_alarm_period_seconds must be a multiple of 60 and at least 60."
  }
}
