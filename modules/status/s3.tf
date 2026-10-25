# Static shell for the page, served from a private bucket through OAC.

resource "aws_s3_bucket" "status_assets" {
  bucket = var.bucket_name

  tags = {
    Name = "${var.name_prefix}-status-assets"
  }
}

resource "aws_s3_bucket_public_access_block" "status_assets" {
  bucket = aws_s3_bucket.status_assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Scoped to the CloudFront service principal AND the consumer's distribution
# ARN, so block_public_policy accepts the policy.
data "aws_iam_policy_document" "status_assets_read" {
  statement {
    sid       = "AllowCloudFrontRead"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.status_assets.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [var.distribution_arn]
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.status_assets.arn, "${aws_s3_bucket.status_assets.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "status_assets" {
  bucket = aws_s3_bucket.status_assets.id
  policy = data.aws_iam_policy_document.status_assets_read.json
}

# The short cache_control is load-bearing: CachingOptimized's 24-hour
# default_ttl applies only when the origin sends no cache header, and
# Terraform issues no invalidation of its own, so a new shell or config would
# otherwise stay invisible at the edge for a day.
resource "aws_s3_object" "status_shell" {
  bucket        = aws_s3_bucket.status_assets.id
  key           = "${local.shell_key_prefix}/index.html"
  source        = "${path.module}/dist/status.html"
  etag          = filemd5("${path.module}/dist/status.html")
  content_type  = "text/html"
  cache_control = "public, max-age=60"
}

resource "aws_s3_object" "status_config" {
  bucket        = aws_s3_bucket.status_assets.id
  key           = "${local.shell_key_prefix}/config.js"
  content       = var.config_js
  content_type  = "application/javascript"
  cache_control = "public, max-age=60"
}
