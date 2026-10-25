# Changelog

## v0.1.1

### Added

- `modules/status`: `behaviors[].rewrite` and `origins[].custom_origin` flags, known at plan time, so a consumer attaches the rewrite function and the Lambda origin's custom origin config without comparing apply-time values.

## v0.1.0

### Added

- `modules/availability`: per-minute canary, outage episodes, change log, Spot interruption capture, and DOWN/RECOVERED notifications, named from `name_prefix`.
- `modules/status`: status Lambda, shell bucket, and CloudFront origin and behavior specs for a consumer's distribution. A consumer supplies `plugin.py` (`authenticate`, `sections`) and `config_js`.
- Single-file status shell committed at `modules/status/dist/status.html`.
- Payload JSON schema with generated TypeScript types.
