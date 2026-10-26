# Status Lambda behind a Function URL that CloudFront reaches via OAC (see
# cloudfront.tf). lambda/status.py's docstring covers the code structure and the
# plugin interface; the consumer owns the distribution.

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  episodes_log_stream = "episodes"
  changes_log_stream  = "changes"
  shell_key_prefix    = trimprefix(var.path_prefix, "/")

  plugin_files = fileset(var.plugin_dir, "*.py")

  codedeploy = var.codedeploy == null ? {
    app_name              = ""
    deployment_group_name = ""
    pipeline_name         = ""
    ecr_repository_name   = ""
    ecr_repository_arn    = ""
    deliberate_creators   = []
  } : var.codedeploy

  backup = var.backup == null ? {
    vault_name            = ""
    mode                  = ""
    schedule              = ""
    retention_days        = 0
    resource_count        = 0
    remote_retention_days = 0
    region                = ""
    copy_vault_arn        = ""
    dest_reader_role_arn  = ""
  } : var.backup

  bedrock = var.bedrock == null ? {
    region             = ""
    model_id           = ""
    max_requests       = 0
    max_tokens         = 0
    max_context_length = 0
  } : var.bedrock

  # Keys set here win over var.plugin_environment in the merge below.
  module_environment = {
    PATH_PREFIX                    = var.path_prefix
    NAME_PREFIX                    = var.name_prefix
    ASG_NAME                       = var.asg_name
    CODEDEPLOY_APP_NAME            = local.codedeploy.app_name
    CODEDEPLOY_DEPLOYMENT_GROUP    = local.codedeploy.deployment_group_name
    DELIBERATE_DEPLOYMENT_CREATORS = join(",", local.codedeploy.deliberate_creators)
    CODEPIPELINE_NAME              = local.codedeploy.pipeline_name
    SOURCE_REPO                    = var.source_repo
    ECR_REPO_NAME                  = local.codedeploy.ecr_repository_name
    EBS_VOLUME_ID                  = var.ebs_volume_id
    STORAGE_BUCKET_NAME            = var.storage_bucket_name
    BACKUP_VAULT_NAME              = local.backup.vault_name
    BACKUP_MODE                    = local.backup.mode
    BACKUP_SCHEDULE                = local.backup.schedule
    BACKUP_RETENTION_DAYS          = var.backup == null ? "" : tostring(local.backup.retention_days)
    BACKUP_RESOURCE_COUNT          = var.backup == null ? "" : tostring(local.backup.resource_count)
    BACKUP_REMOTE_RETENTION_DAYS   = var.backup == null ? "" : tostring(local.backup.remote_retention_days)
    BACKUP_REGION                  = local.backup.region
    BACKUP_COPY_VAULT_ARN          = local.backup.copy_vault_arn
    BACKUP_DEST_READER_ROLE_ARN    = local.backup.dest_reader_role_arn
    SPOT_ENABLED                   = tostring(var.spot_enabled)
    BEDROCK_ENABLED                = tostring(var.bedrock != null)
    BEDROCK_REGION                 = local.bedrock.region
    BEDROCK_MODEL_ID               = local.bedrock.model_id
    BEDROCK_MAX_REQUESTS           = var.bedrock == null ? "" : local.bedrock.max_requests == null ? "" : tostring(local.bedrock.max_requests)
    BEDROCK_MAX_TOKENS             = var.bedrock == null ? "" : local.bedrock.max_tokens == null ? "" : tostring(local.bedrock.max_tokens)
    BEDROCK_MAX_CONTEXT_LENGTH     = var.bedrock == null ? "" : local.bedrock.max_context_length == null ? "" : tostring(local.bedrock.max_context_length)
    EPISODES_LOG_GROUP             = var.episodes_log_group
    EPISODES_LOG_STREAM            = local.episodes_log_stream
    CHANGES_LOG_STREAM             = local.changes_log_stream
    SPOT_INTERRUPTIONS_LOG_GROUP   = var.spot_interruptions_log_group
    SITEUP_METRIC_NAMESPACE        = var.siteup_metric_namespace
    MONTHLY_BUDGET_USD             = var.cost == null ? "" : tostring(var.cost.monthly_budget_usd)
    COST_ENABLED                   = tostring(var.cost != null)
    HOST_METRICS_ENABLED           = tostring(var.host_metrics != null)
    VOLUME_METRICS_ENABLED         = tostring(try(var.host_metrics.volume_metrics, false))
    PUBLIC_RELIABILITY             = tostring(var.public_reliability)
  }
}

# output_path lives outside lambda/ to avoid recursive packaging on re-apply.
# The handler and the plugin's top-level modules sit side by side at the zip
# root, where `import plugin` finds them.
data "archive_file" "status" {
  type        = "zip"
  output_path = "${path.module}/dist/status.zip"

  source {
    content  = file("${path.module}/lambda/status.py")
    filename = "status.py"
  }

  dynamic "source" {
    for_each = local.plugin_files
    content {
      content  = file("${var.plugin_dir}/${source.value}")
      filename = source.value
    }
  }
}

resource "aws_lambda_function" "status" {
  function_name    = "${var.name_prefix}-status"
  role             = aws_iam_role.status.arn
  runtime          = "python3.13"
  architectures    = ["arm64"]
  handler          = "status.handler"
  filename         = data.archive_file.status.output_path
  source_code_hash = data.archive_file.status.output_base64sha256
  # Lambda scales vCPU with memory; the panel fan-out in lambda/status.py is
  # CPU-bound waiting on network I/O across threads, so roughly 4x the CPU at
  # 512 MB cuts wall time by close to the same factor, leaving GB-seconds (and
  # so cost) close to a wash while cold-start import time drops too.
  memory_size = 512
  timeout     = 20

  reserved_concurrent_executions = var.reserved_concurrency

  # CloudFront can invoke within seconds of creation; without this the runtime
  # auto-creates the log group first and Terraform's create conflicts.
  depends_on = [aws_cloudwatch_log_group.status_lambda]

  environment {
    variables = merge(var.plugin_environment, local.module_environment)
  }

  tags = {
    Name = "${var.name_prefix}-status"
  }
}

resource "aws_lambda_function_url" "status" {
  function_name      = aws_lambda_function.status.function_name
  authorization_type = "AWS_IAM"
}

resource "aws_cloudwatch_log_group" "status_lambda" {
  name              = "/aws/lambda/${var.name_prefix}-status"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.name_prefix}-status-lambda"
  }
}
