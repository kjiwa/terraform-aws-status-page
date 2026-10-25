variable "name_prefix" {
  description = "Prefix for every resource name: <name_prefix>-status, -status-assets, -status-index-rewrite."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]*$", var.name_prefix))
    error_message = "name_prefix must be lowercase letters, digits and hyphens, starting with a letter or digit, so it is valid in every resource name derived from it."
  }
}

variable "path_prefix" {
  description = "URL path the page is served under on the consumer's distribution; the Lambda routes <path_prefix>/data, /series and /public."
  type        = string
  default     = "/status"
  validation {
    condition     = can(regex("^/[^/]+(/[^/]+)*$", var.path_prefix))
    error_message = "path_prefix must start with exactly one slash, name at least one segment, and not end with a slash, for example /status."
  }
}

variable "bucket_name" {
  description = "Globally unique name of the S3 bucket holding the page shell and config.js."
  type        = string
}

variable "plugin_dir" {
  description = "Directory whose top-level *.py files are packaged next to status.py; it must contain plugin.py."
  type        = string
  validation {
    condition     = fileexists("${var.plugin_dir}/plugin.py")
    error_message = "plugin_dir must contain plugin.py, because the Lambda imports the module named plugin at start-up."
  }
}

variable "plugin_environment" {
  description = "Extra Lambda environment variables for the plugin; keys the module sets itself (PATH_PREFIX, ASG_NAME, ...) always win."
  type        = map(string)
  default     = {}
}

variable "plugin_policy_json" {
  description = "IAM policy document JSON attached to the Lambda role as an extra inline policy for the plugin's own AWS calls; null attaches nothing."
  type        = string
  default     = null
}

variable "config_js" {
  description = "Full content of <path_prefix>/config.js, the per-deployment shell configuration (auth header, token key, sign-in URL, disabled panels)."
  type        = string
}

variable "auth_header" {
  description = "Request header carrying the caller's token, the only header CloudFront forwards to the Lambda; it cannot be Authorization because OAC overwrites that with its SigV4 signature."
  type        = string
}

variable "distribution_arn" {
  description = "ARN of the consumer's CloudFront distribution, allowed to read the shell bucket and invoke the Lambda."
  type        = string
}

variable "asg_name" {
  description = "Auto Scaling Group name, looked up to find the running instance for the host and image panels."
  type        = string
}

variable "episodes_log_group" {
  description = "Name of the availability recorder's episodes log group (streams episodes and changes)."
  type        = string
}

variable "spot_interruptions_log_group" {
  description = "Name of the availability recorder's Spot interruption log group."
  type        = string
}

variable "siteup_metric_namespace" {
  description = "CloudWatch namespace of the availability recorder's SiteUp metric."
  type        = string
}

variable "source_repo" {
  description = "GitHub owner/repo id (not a URL) the deployment pipeline builds from, shown beside each deployment's commit; empty hides the link."
  type        = string
  default     = ""
}

variable "spot_enabled" {
  description = "Whether the fleet runs on Spot, so the Spot panel shows even before the first reclaim."
  type        = bool
  default     = false
}

variable "public_reliability" {
  description = "Whether <path_prefix>/public serves the redacted reliability and incidents panels unauthenticated; also adds the public behavior to the behaviors output."
  type        = bool
  default     = false
}

variable "ebs_volume_id" {
  description = "EBS data volume ID read for the storage panel; empty omits the volume."
  type        = string
  default     = ""
}

variable "storage_bucket_name" {
  description = "S3 bucket whose BucketSizeBytes and NumberOfObjects metrics the storage panel reads; empty omits it."
  type        = string
  default     = ""
}

variable "codedeploy" {
  description = "CodeDeploy, CodePipeline and ECR names for the deployment panel and its IAM read grants; null disables the panel and the grants."
  type = object({
    app_name              = string
    deployment_group_name = string
    pipeline_name         = string
    ecr_repository_name   = string
    ecr_repository_arn    = string
    deliberate_creators   = optional(list(string), [])
  })
  default = null
}

variable "backup" {
  description = "AWS Backup facts for the backups panel (all reported as-is except vault_name and the ARNs, which scope IAM); null disables the panel and its IAM."
  type = object({
    vault_name            = string
    mode                  = optional(string, "")
    schedule              = optional(string, "")
    retention_days        = optional(number, 0)
    resource_count        = optional(number, 0)
    remote_retention_days = optional(number, 0)
    region                = optional(string, "")
    copy_vault_arn        = optional(string, "")
    dest_reader_role_arn  = optional(string, "")
  })
  default = null
}

variable "bedrock" {
  description = "Bedrock model and limits shown on the Bedrock panel, which reports 30-day token counts from the region's AWS/Bedrock metrics; null disables the panel."
  type = object({
    region             = string
    model_id           = string
    max_requests       = number
    max_tokens         = number
    max_context_length = number
  })
  default = null
}

variable "cost" {
  description = "Enables the cost panel (Cost Explorer bills $0.01 per uncached request) with this monthly budget in USD shown for context; null disables the panel and its IAM."
  type = object({
    monthly_budget_usd = number
  })
  default = null
}

variable "host_metrics" {
  description = "Enables the host metrics panel, reading custom metrics the instance publishes; volume_metrics switches the Storage panel to exact byte metrics. Null disables the panel."
  type = object({
    volume_metrics = optional(bool, false)
  })
  default = null
}

variable "log_retention_days" {
  description = "Retention in days of the Lambda's log group."
  type        = number
  default     = 30
}

variable "reserved_concurrency" {
  description = "Lambda reserved concurrency; keep it well below the account pool so a request flood cannot throttle other functions such as the availability canary."
  type        = number
  default     = 10
}
