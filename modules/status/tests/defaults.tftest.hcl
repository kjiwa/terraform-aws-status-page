mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_data "aws_region" {
    defaults = {
      region = "us-east-1"
    }
  }
}

variables {
  name_prefix                  = "example-site"
  bucket_name                  = "example-site-status"
  plugin_dir                   = "tests/plugin"
  config_js                    = "window.statusConfig = {};"
  auth_header                  = "X-Example-Token"
  distribution_arn             = "arn:aws:cloudfront::123456789012:distribution/EXAMPLE"
  asg_name                     = "example-site-asg"
  episodes_log_group           = "/example-site/availability-episodes"
  spot_interruptions_log_group = "/aws/events/example-site-spot-interruptions"
  siteup_metric_namespace      = "ExampleSite"
  codedeploy = {
    app_name              = "example-site"
    deployment_group_name = "example-site"
    pipeline_name         = "example-site"
    ecr_repository_name   = "example-site"
    ecr_repository_arn    = "arn:aws:ecr:us-east-1:123456789012:repository/example-site"
    deliberate_creators   = ["user"]
  }
}

run "names_derive_from_prefix" {
  command = plan

  assert {
    condition = alltrue([
      aws_lambda_function.status.function_name == "example-site-status",
      aws_iam_role.status.name == "example-site-status",
      aws_iam_role_policy.status.name == "example-site-status",
      aws_cloudwatch_log_group.status_lambda.name == "/aws/lambda/example-site-status",
      aws_cloudfront_origin_access_control.status.name == "example-site-status",
      aws_cloudfront_origin_access_control.status_assets.name == "example-site-status-assets",
      aws_cloudfront_origin_request_policy.status.name == "example-site-status",
      aws_cloudfront_function.status_rewrite.name == "example-site-status-index-rewrite",
      aws_s3_bucket.status_assets.bucket == "example-site-status",
    ])
    error_message = "Resource names must derive from name_prefix and bucket_name."
  }

  assert {
    condition = alltrue([
      aws_s3_object.status_shell.key == "status/index.html",
      aws_s3_object.status_config.key == "status/config.js",
    ])
    error_message = "Shell and config keys must sit under the path prefix without its leading slash."
  }
}

run "rewrite_flag_marks_function_behaviors" {
  command = plan

  assert {
    condition     = [for b in output.behaviors : b.path_pattern if b.rewrite] == ["/status", "/status/"]
    error_message = "Only the two shell paths carry the rewrite function."
  }

  assert {
    condition     = [for o in output.origins : o.origin_id if o.custom_origin] == ["status-lambda"]
    error_message = "Only the Lambda origin is a custom origin."
  }
}

run "behaviors_without_public" {
  command = plan

  assert {
    condition     = length(output.behaviors) == 5
    error_message = "Five behaviors without public_reliability."
  }

  assert {
    condition     = [for b in output.behaviors : b.path_pattern if b.origin_id == "status-s3"] == ["/status", "/status/", "/status/config.js"]
    error_message = "The shell, its slash form and config.js route to the S3 origin."
  }
}

run "behaviors_with_public" {
  command = plan

  variables {
    public_reliability = true
  }

  assert {
    condition     = length(output.behaviors) == 6
    error_message = "Six behaviors with public_reliability."
  }

  assert {
    condition     = [for b in output.behaviors : b.path_pattern][5] == "/status/public"
    error_message = "The public behavior comes last."
  }
}

run "no_codedeploy_drops_panel_and_iam" {
  command = plan

  variables {
    codedeploy = null
  }

  assert {
    condition     = aws_lambda_function.status.environment[0].variables["CODEDEPLOY_APP_NAME"] == ""
    error_message = "CODEDEPLOY_APP_NAME must be empty without codedeploy."
  }

  assert {
    condition     = length([for s in data.aws_iam_policy_document.status.statement : s if contains(["Deployments", "PipelineCommits", "EcrDescribeImages"], s.sid)]) == 0
    error_message = "No CodeDeploy, CodePipeline or ECR statement without codedeploy."
  }
}

run "codedeploy_adds_iam" {
  command = plan

  assert {
    condition     = length([for s in data.aws_iam_policy_document.status.statement : s if contains(["Deployments", "PipelineCommits", "EcrDescribeImages"], s.sid)]) == 3
    error_message = "CodeDeploy, CodePipeline and ECR statements with codedeploy."
  }
}

run "plugin_environment_cannot_override_module_keys" {
  command = plan

  variables {
    plugin_environment = {
      PATH_PREFIX = "/hijacked"
      EXTRA       = "kept"
    }
  }

  assert {
    condition     = aws_lambda_function.status.environment[0].variables["PATH_PREFIX"] == "/status"
    error_message = "plugin_environment must not override PATH_PREFIX."
  }

  assert {
    condition     = aws_lambda_function.status.environment[0].variables["EXTRA"] == "kept"
    error_message = "plugin_environment keys the module does not set must pass through."
  }
}

run "path_prefix_requires_leading_slash" {
  command = plan

  variables {
    path_prefix = "status"
  }

  expect_failures = [var.path_prefix]
}

run "path_prefix_rejects_trailing_slash" {
  command = plan

  variables {
    path_prefix = "/status/"
  }

  expect_failures = [var.path_prefix]
}

run "plugin_dir_requires_plugin" {
  command = plan

  variables {
    plugin_dir = "lambda"
  }

  expect_failures = [var.plugin_dir]
}

run "bedrock_limits_are_optional" {
  command = plan

  variables {
    bedrock = {
      region   = "us-west-2"
      model_id = "example-model"
    }
  }

  assert {
    condition     = aws_lambda_function.status.environment[0].variables["BEDROCK_MAX_TOKENS"] == ""
    error_message = "An omitted Bedrock limit must reach the Lambda as an empty string."
  }
}
