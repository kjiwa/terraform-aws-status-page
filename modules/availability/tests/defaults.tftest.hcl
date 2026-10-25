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
  name_prefix      = "example-site"
  metric_namespace = "ExampleSite"
  primary_domain   = "example.com"
  asg_name         = "example-site-asg"
  alert_email      = "ops@example.com"
  active           = true
  codedeploy = {
    app_name              = "example-site"
    deployment_group_name = "example-site"
    deliberate_creators   = ["user"]
  }
}

run "names_derive_from_prefix" {
  command = plan

  assert {
    condition     = aws_lambda_function.availability.function_name == "example-site-availability"
    error_message = "Lambda function name"
  }

  assert {
    condition     = aws_iam_role.availability.name == "example-site-availability"
    error_message = "IAM role name"
  }

  assert {
    condition     = aws_iam_role_policy.availability.name == "example-site-availability"
    error_message = "IAM policy name"
  }

  assert {
    condition     = aws_cloudwatch_log_group.lambda.name == "/aws/lambda/example-site-availability"
    error_message = "Lambda log group name"
  }

  assert {
    condition     = aws_sns_topic.alerts.name == "example-site-alerts"
    error_message = "SNS topic name"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.site_down.alarm_name == "example-site-site-down"
    error_message = "Alarm name"
  }

  assert {
    condition = alltrue([
      aws_cloudwatch_event_rule.canary.name == "example-site-availability-canary",
      aws_cloudwatch_event_rule.alarm_state.name == "example-site-availability-alarm-state",
      aws_cloudwatch_event_rule.instance_refresh_change.name == "example-site-instance-refresh-change",
      aws_cloudwatch_event_rule.deployment_change[0].name == "example-site-deployment-change",
      aws_cloudwatch_event_rule.spot_interruption.name == "example-site-spot-interruption",
    ])
    error_message = "Event rule names"
  }

  assert {
    condition     = aws_ssm_parameter.state.name == "/example-site/availability/state"
    error_message = "State parameter name"
  }

  assert {
    condition     = aws_cloudwatch_log_group.episodes.name == "/example-site/availability-episodes"
    error_message = "Episodes log group name"
  }

  assert {
    condition     = aws_cloudwatch_log_group.spot_interruptions.name == "/aws/events/example-site-spot-interruptions"
    error_message = "Spot log group name"
  }

  assert {
    condition     = aws_cloudwatch_log_resource_policy.spot_log_delivery.policy_name == "example-site-spot-eventbridge"
    error_message = "Log resource policy name"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.site_down.namespace == "ExampleSite"
    error_message = "Alarm namespace"
  }
}

run "no_codedeploy_drops_deployment_change" {
  command = plan

  variables {
    codedeploy = null
  }

  assert {
    condition     = length(aws_cloudwatch_event_rule.deployment_change) == 0
    error_message = "deployment_change rule must not exist without codedeploy"
  }

  assert {
    condition     = length(aws_cloudwatch_event_target.deployment_change) == 0 && length(aws_lambda_permission.deployment_change) == 0
    error_message = "deployment_change target and permission must not exist without codedeploy"
  }

  assert {
    condition     = aws_lambda_function.availability.environment[0].variables["CODEDEPLOY_APP_NAME"] == ""
    error_message = "CODEDEPLOY_APP_NAME must be empty"
  }
}
