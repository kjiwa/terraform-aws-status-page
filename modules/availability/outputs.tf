output "sns_topic_arn" {
  description = "ARN of the alerts topic."
  value       = aws_sns_topic.alerts.arn
}

output "sns_topic_name" {
  description = "Name of the alerts topic."
  value       = aws_sns_topic.alerts.name
}

output "episodes_log_group_name" {
  description = "Log group holding the outage episodes and the change log."
  value       = aws_cloudwatch_log_group.episodes.name
}

output "episodes_log_group_arn" {
  description = "ARN of the episodes log group."
  value       = aws_cloudwatch_log_group.episodes.arn
}

output "spot_interruptions_log_group_name" {
  description = "Log group holding raw Spot interruption warnings."
  value       = aws_cloudwatch_log_group.spot_interruptions.name
}

output "site_down_alarm_name" {
  description = "Name of the site-down CloudWatch alarm."
  value       = aws_cloudwatch_metric_alarm.site_down.alarm_name
}

output "availability_function_name" {
  description = "Name of the availability Lambda."
  value       = aws_lambda_function.availability.function_name
}

output "availability_function_arn" {
  description = "ARN of the availability Lambda."
  value       = aws_lambda_function.availability.arn
}
