# terraform-aws-status-page

Terraform modules and a static shell for a self-hosted status page on AWS: reliability, incidents, changes, Spot, host, storage, backups, cost, and a Bedrock usage panel. An app composes the core at runtime with its own authenticator and panels; the core never names the app.

Status: scaffold. Modules are added release by release; see CHANGELOG.md.

## Modules

| Module | Purpose |
|---|---|
| `modules/availability` | Probe, episode and change recorder, alarms, Spot interruption capture |
| `modules/status` | Lambda JSON API, S3-hosted single-file shell, origin and behavior specs |

## Usage

Pin a literal `?ref=vX.Y.Z`. Before 1.0 a minor release may break; release notes list the `moved` blocks consumers need.

## Verification

```sh
pre-commit run --all-files
```
