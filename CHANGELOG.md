# Changelog

## v0.2.0

### Added

- `config.js` `theme()` may return `tokens`, an object of color overrides keyed by `surface`, `card`, `on-surface`, `muted`, `border`, `secondary`, `on-secondary`, `good`, `warn`, `bad`, `gray`, `chart-1`, `chart-2`, `chart-3`, `chart-2-tint` and `chart-track`. Unknown keys and values `CSS.supports('color', v)` rejects are dropped. Tokens apply after `primary`, so `tokens.secondary` wins. A consumer returns the set that matches the `scheme` it returns.

### Changed

- `theme()` results gain a `tokens` field (`null` when absent). A consumer that returns only `scheme` and `primary` is unaffected.

## v0.1.2

### Changed

- `modules/status`: `bedrock.max_requests`, `max_tokens` and `max_context_length` are optional; the panel shows a dash for an omitted limit.

## v0.1.1

### Added

- `modules/status`: `behaviors[].rewrite` and `origins[].custom_origin` flags, known at plan time, so a consumer attaches the rewrite function and the Lambda origin's custom origin config without comparing apply-time values.

## v0.1.0

### Added

- `modules/availability`: per-minute canary, outage episodes, change log, Spot interruption capture, and DOWN/RECOVERED notifications, named from `name_prefix`.
- `modules/status`: status Lambda, shell bucket, and CloudFront origin and behavior specs for a consumer's distribution. A consumer supplies `plugin.py` (`authenticate`, `sections`) and `config_js`.
- Single-file status shell committed at `modules/status/dist/status.html`.
- Payload JSON schema with generated TypeScript types.
