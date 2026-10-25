output "function_name" {
  description = "Status Lambda function name."
  value       = aws_lambda_function.status.function_name
}

output "function_url" {
  description = "Status Lambda Function URL (https://<id>.lambda-url.<region>.on.aws/)."
  value       = aws_lambda_function_url.status.function_url
}

output "shell_bucket_name" {
  description = "Name of the S3 bucket holding the page shell and config.js."
  value       = aws_s3_bucket.status_assets.id
}

output "origins" {
  description = "CloudFront origins to attach: the shell S3 bucket (OAC) and the Lambda Function URL (OAC; HTTPS-only custom origin, domain without scheme or slash)."
  value = [
    {
      origin_id                = local.origin_id_s3
      domain_name              = aws_s3_bucket.status_assets.bucket_regional_domain_name
      origin_access_control_id = aws_cloudfront_origin_access_control.status_assets.id
    },
    {
      origin_id                = local.origin_id_lambda
      domain_name              = trimsuffix(trimprefix(aws_lambda_function_url.status.function_url, "https://"), "/")
      origin_access_control_id = aws_cloudfront_origin_access_control.status.id
    },
  ]
}

output "behaviors" {
  description = "CloudFront ordered cache behaviors to attach, in order; origin_request_policy_id and function_arn are null when unused, and GET, HEAD and OPTIONS suffice for allowed_methods."
  value       = local.behaviors
}
