# Everything the consumer's distribution attaches: OACs, the origin request
# policy, the viewer-request rewrite and the Lambda permissions. The module
# never creates the distribution; the origins and behaviors outputs describe
# what to attach.

locals {
  cache_policy_caching_optimized = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  cache_policy_caching_disabled  = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"

  origin_id_s3     = "status-s3"
  origin_id_lambda = "status-lambda"
}

resource "aws_cloudfront_origin_access_control" "status" {
  name                              = "${var.name_prefix}-status"
  description                       = "OAC for the status page Lambda Function URL"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_origin_access_control" "status_assets" {
  name                              = "${var.name_prefix}-status-assets"
  description                       = "OAC for the static status page shell bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Forwards only the auth header and the /series query parameters, no cookies.
# A managed policy such as AllViewer also forwards Host, which breaks OAC's
# SigV4 signature on a Lambda origin just as it does on an S3 origin.
resource "aws_cloudfront_origin_request_policy" "status" {
  name    = "${var.name_prefix}-status"
  comment = "Forward ${var.auth_header} and the series panel/range/end query params to the status Lambda"

  headers_config {
    header_behavior = "whitelist"
    headers {
      items = [var.auth_header]
    }
  }

  cookies_config {
    cookie_behavior = "none"
  }

  query_strings_config {
    query_string_behavior = "whitelist"
    query_strings {
      items = ["panel", "range", "end"]
    }
  }
}

# OAC fronts the S3 REST endpoint, which serves objects literally and does not
# synthesize index.html for a directory-style request.
resource "aws_cloudfront_function" "status_rewrite" {
  name    = "${var.name_prefix}-status-index-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Serve ${local.shell_key_prefix}/index.html for ${var.path_prefix} and ${var.path_prefix}/"
  publish = true
  code    = <<-JS
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      if (uri === '${var.path_prefix}' || uri === '${var.path_prefix}/') {
        request.uri = '${var.path_prefix}/index.html';
      }
      return request;
    }
  JS
}

# Function URLs invoked through CloudFront OAC are authorized with
# lambda:InvokeFunctionUrl.
resource "aws_lambda_permission" "status" {
  statement_id           = "AllowCloudFrontServicePrincipal"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.status.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = var.distribution_arn
  function_url_auth_type = "AWS_IAM"
}

# Since October 2025 AWS also requires a plain lambda:InvokeFunction grant
# alongside InvokeFunctionUrl; without it CloudFront's OAC-signed request gets
# a 403 before the function runs, with no invocation and no log entry.
resource "aws_lambda_permission" "status_invoke_function" {
  statement_id  = "AllowCloudFrontServicePrincipalInvokeFunction"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.status.function_name
  principal     = "cloudfront.amazonaws.com"
  source_arn    = var.distribution_arn
}

# Exact path patterns, never a wildcard: first match wins, and a wildcard would
# match <path_prefix>/public/, which the Lambda's trailing-slash normalization
# folds into /public, serving the public payload from an uncached behavior.
locals {
  shell_behavior = {
    origin_id                = local.origin_id_s3
    cache_policy_id          = local.cache_policy_caching_optimized
    origin_request_policy_id = null
    function_arn             = null
    rewrite                  = false
  }

  lambda_behavior = {
    origin_id                = local.origin_id_lambda
    cache_policy_id          = local.cache_policy_caching_disabled
    origin_request_policy_id = aws_cloudfront_origin_request_policy.status.id
    function_arn             = null
    rewrite                  = false
  }

  behaviors = concat(
    [
      merge(local.shell_behavior, { path_pattern = var.path_prefix, function_arn = aws_cloudfront_function.status_rewrite.arn, rewrite = true }),
      merge(local.shell_behavior, { path_pattern = "${var.path_prefix}/", function_arn = aws_cloudfront_function.status_rewrite.arn, rewrite = true }),
      merge(local.shell_behavior, { path_pattern = "${var.path_prefix}/config.js" }),
      merge(local.lambda_behavior, { path_pattern = "${var.path_prefix}/data" }),
      merge(local.lambda_behavior, { path_pattern = "${var.path_prefix}/series" }),
    ],
    # No origin request policy: with no client headers forwarded, the auth
    # header can never reach this route, so nothing caller-specific can
    # influence the cache key or leak into the cached response.
    var.public_reliability ? [
      merge(local.shell_behavior, {
        path_pattern    = "${var.path_prefix}/public"
        origin_id       = local.origin_id_lambda
        cache_policy_id = local.cache_policy_caching_optimized
      }),
    ] : [],
  )
}
