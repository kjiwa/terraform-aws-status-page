locals {
  arn_scope = "${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}"
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "status" {
  name               = "${var.name_prefix}-status"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json

  tags = {
    Name = "${var.name_prefix}-status"
  }
}

data "aws_iam_policy_document" "status" {
  statement {
    sid     = "OwnLogs"
    effect  = "Allow"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      "${aws_cloudwatch_log_group.status_lambda.arn}:*",
    ]
  }

  # Describe* calls don't support resource-level scoping. Covers the host panel
  # (instance + ASG) and the image panel (AMI).
  statement {
    sid    = "DescribeInfra"
    effect = "Allow"
    actions = [
      "ec2:DescribeInstances",
      "ec2:DescribeImages",
      "autoscaling:DescribeAutoScalingGroups",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "DescribeVolumes"
    effect    = "Allow"
    actions   = ["ec2:DescribeVolumes"]
    resources = ["*"]
  }

  # ListDeployments is scopable to the deployment group; BatchGetDeployments is
  # scoped by individual deployment (arn:...:deployment:<id>), and deployment
  # IDs aren't known ahead of time, so that half is wildcarded within this
  # account/region rather than opened up to "*".
  dynamic "statement" {
    for_each = var.codedeploy != null ? [var.codedeploy] : []
    content {
      sid    = "Deployments"
      effect = "Allow"
      actions = [
        "codedeploy:ListDeployments",
        "codedeploy:BatchGetDeployments",
      ]
      resources = [
        "arn:aws:codedeploy:${local.arn_scope}:deploymentgroup:${statement.value.app_name}/${statement.value.deployment_group_name}",
        "arn:aws:codedeploy:${local.arn_scope}:deployment:*",
      ]
    }
  }

  # Joins each CodeDeploy deployment to the commit that triggered it (see
  # pipeline_commits() in lambda/status.py).
  dynamic "statement" {
    for_each = var.codedeploy != null ? [var.codedeploy] : []
    content {
      sid       = "PipelineCommits"
      effect    = "Allow"
      actions   = ["codepipeline:ListActionExecutions"]
      resources = ["arn:aws:codepipeline:${local.arn_scope}:${statement.value.pipeline_name}"]
    }
  }

  dynamic "statement" {
    for_each = var.codedeploy != null ? [var.codedeploy] : []
    content {
      sid       = "EcrDescribeImages"
      effect    = "Allow"
      actions   = ["ecr:DescribeImages"]
      resources = [statement.value.ecr_repository_arn]
    }
  }

  # Both Logs Insights actions are scopable to the log group.
  statement {
    sid     = "IncidentLog"
    effect  = "Allow"
    actions = ["logs:StartQuery", "logs:GetQueryResults"]
    resources = [
      "arn:aws:logs:${local.arn_scope}:log-group:${var.episodes_log_group}:*",
      "arn:aws:logs:${local.arn_scope}:log-group:${var.spot_interruptions_log_group}:*",
    ]
  }

  # GetMetricData supports neither resource-level scoping nor a namespace
  # condition key, so it is a single "*" statement covering the reliability
  # panel's SiteUp series, the storage panel's S3 bucket metrics, the Bedrock
  # panel's token counts (in the bedrock region), and host_metrics.
  statement {
    sid       = "ReadMetrics"
    effect    = "Allow"
    actions   = ["cloudwatch:GetMetricData"]
    resources = ["*"]
  }

  # ListBackupJobs/ListCopyJobs aren't resource-scopable.
  dynamic "statement" {
    for_each = var.backup != null ? [1] : []
    content {
      sid       = "Backups"
      effect    = "Allow"
      actions   = ["backup:ListBackupJobs", "backup:ListCopyJobs"]
      resources = ["*"]
    }
  }

  dynamic "statement" {
    for_each = var.backup != null ? [var.backup] : []
    content {
      sid     = "DescribeBackupVault"
      effect  = "Allow"
      actions = ["backup:DescribeBackupVault"]
      # The local vault, plus a same-account destination vault in another
      # region. A cross-account destination is read through the assumed role
      # below instead; AWS rejects cross-account vault reads regardless of an
      # IAM grant here.
      resources = concat(
        ["arn:aws:backup:${local.arn_scope}:backup-vault:${statement.value.vault_name}"],
        statement.value.copy_vault_arn != "" && statement.value.dest_reader_role_arn == "" ? [statement.value.copy_vault_arn] : [],
      )
    }
  }

  dynamic "statement" {
    for_each = try(var.backup.dest_reader_role_arn, "") != "" ? [var.backup.dest_reader_role_arn] : []
    content {
      sid       = "AssumeVaultReaderRole"
      effect    = "Allow"
      actions   = ["sts:AssumeRole"]
      resources = [statement.value]
    }
  }

  # Cost Explorer actions are not resource-scopable. Absent unless the cost
  # panel is enabled: every GetCostAndUsage call bills $0.01.
  dynamic "statement" {
    for_each = var.cost != null ? [1] : []
    content {
      sid       = "Cost"
      effect    = "Allow"
      actions   = ["ce:GetCostAndUsage"]
      resources = ["*"]
    }
  }
}

resource "aws_iam_role_policy" "status" {
  name   = "${var.name_prefix}-status"
  role   = aws_iam_role.status.id
  policy = data.aws_iam_policy_document.status.json
}

resource "aws_iam_role_policy" "status_plugin" {
  count = var.plugin_policy_json != null ? 1 : 0

  name   = "${var.name_prefix}-status-plugin"
  role   = aws_iam_role.status.id
  policy = var.plugin_policy_json
}
