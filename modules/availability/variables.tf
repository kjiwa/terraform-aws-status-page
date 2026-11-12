variable "name_prefix" {
  description = "Prefix for every resource name: <prefix>-availability, <prefix>-alerts, <prefix>-site-down, and the /<prefix>/ SSM and log-group paths. Also the email subject tag."
  type        = string
}

variable "metric_namespace" {
  description = "CloudWatch namespace the canary publishes SiteUp and LatencyMs to."
  type        = string
}

variable "primary_domain" {
  description = "Apex domain serving the site. The canary probes https://<primary_domain>/."
  type        = string
}

variable "asg_name" {
  description = "Auto Scaling Group name. Used to look up the replacement instance after an outage."
  type        = string
}

variable "alert_email" {
  description = "Email address that receives DOWN/RECOVERED notices. Confirm the SNS subscription email after the first apply."
  type        = string
}

variable "canary_enabled" {
  description = "If false, an external publisher sends SiteUp every minute and the Lambda runs no probe: its schedule writes SiteUp = 0 for each minute the publisher missed, so a silent publisher counts as down."
  type        = bool
  default     = true
}

variable "planned_causes" {
  description = "Outage causes recorded as planned, which the status page leaves out of its uptime series. Any of rightsize, deploy, instance-refresh, capacity-change and backup. Empty counts every outage."
  type        = list(string)
  default     = ["rightsize", "deploy", "instance-refresh", "capacity-change", "backup"]

  validation {
    condition     = alltrue([for cause in var.planned_causes : contains(["rightsize", "deploy", "instance-refresh", "capacity-change", "backup"], cause)])
    error_message = "planned_causes may hold only rightsize, deploy, instance-refresh, capacity-change and backup, the causes the availability function can attribute as deliberate."
  }
}

variable "site_down_alarm" {
  description = "When the site-down alarm fires: datapoints_to_alarm bad minutes within the last evaluation_periods. The default 2 of 3 ignores a one-minute blip; 1 of 3 alarms on any bad minute."
  type = object({
    evaluation_periods  = optional(number, 3)
    datapoints_to_alarm = optional(number, 2)
  })
  default = {}

  validation {
    condition = (
      floor(var.site_down_alarm.evaluation_periods) == var.site_down_alarm.evaluation_periods &&
      floor(var.site_down_alarm.datapoints_to_alarm) == var.site_down_alarm.datapoints_to_alarm &&
      var.site_down_alarm.datapoints_to_alarm >= 1 &&
      var.site_down_alarm.datapoints_to_alarm <= var.site_down_alarm.evaluation_periods
    )
    error_message = "evaluation_periods and datapoints_to_alarm must be whole numbers with 1 <= datapoints_to_alarm <= evaluation_periods."
  }
}

variable "active" {
  description = "If false the environment is asleep: the schedule and the alarm-notification rule are disabled so a deliberately-empty ASG does not page anyone. With `canary_enabled = false` the external publisher must also stop sending SiteUp. Re-enabling sends one RECOVERED notice once the site is back."
  type        = bool
}

variable "codedeploy" {
  description = "Optional CodeDeploy change source: the deployment-change rule and the deploy cause-attribution query. deliberate_creators are the creator values that count as a deliberate deploy."
  type = object({
    app_name              = string
    deployment_group_name = string
    deliberate_creators   = list(string)
  })
  default = null
}

variable "last_rightsize_param" {
  description = "Optional SSM parameter holding the rightsize watchdog's cause-attribution marker. Read by the availability Lambda."
  type = object({
    name = string
    arn  = string
  })
  default = null
}

variable "last_health_watchdog_param" {
  description = "Optional SSM parameter holding the health watchdog's cause-attribution marker. Read by the availability Lambda."
  type = object({
    name = string
    arn  = string
  })
  default = null
}

variable "last_backup_snapshot_param" {
  description = "Optional SSM parameter holding the backup snapshot's cause-attribution marker. Read by the availability Lambda."
  type = object({
    name = string
    arn  = string
  })
  default = null
}

variable "alarm_publishers" {
  description = "Names of CloudWatch alarms allowed to publish to the alerts topic."
  type        = list(string)
  default     = []
}
