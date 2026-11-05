# Changelog

## v0.3.1

### Fixed

- The Spot recovery split times a reclaim from the interruption warning. Capacity wait read 0 whenever the drain launched the replacement before the first failed probe, and launch-to-serving exceeded the outage. The page derives both segments from `old_instance.time`, `new_instance.launched` and `ended`, so earlier episodes count without a backfill. The RECOVERED email prints the same two segments for every Spot reclaim.

### Changed

- `capacity_wait_s` on a spot-reclaim episode is measured from the interruption warning from this release; other causes still measure from the outage start. The page no longer reads the stored `capacity_wait_s` and `boot_to_serve_s`.

## v0.3.0

### Added

- `modules/host-alarms`: AWS Backup failure alert, data-volume disk alarm, availability dashboard and saved Logs Insights queries, named from `name_prefix` and reading `metric_namespace`. The disk alarm notifies on alarm and on OK, reads either `DiskUsedPercent` or, with `volume_metrics_enabled`, the `DiskUsedBytes`/`DiskTotalBytes` pair for `Mount=data`, and takes `disk_alarm_used_percent` and `disk_alarm_period_seconds`. `root_disk_alarm_enabled` adds a second alarm on `Mount=root` when volume metrics are on. The `alarm_names` output feeds `modules/availability`'s `alarm_publishers` without a dependency cycle.

### Changed

- Build tooling: `minimatch` is overridden to 11.0.1 (GHSA-g3hv-75wg-m249, dev scope) and `preact` and the other npm group dependencies are bumped; `modules/status/dist` is rebuilt.

### Upgrade

- A consumer adopting `modules/host-alarms` moves its backup-failure rule and target, `disk_used` alarm, dashboard and three query definitions with `moved` blocks; resource labels match.

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
