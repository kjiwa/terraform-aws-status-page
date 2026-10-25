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

variable "active" {
  description = "If false the environment is asleep: the canary schedule and the alarm-notification rule are disabled so a deliberately-empty ASG does not page anyone. Re-enabling sends one RECOVERED notice once the site is back."
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
