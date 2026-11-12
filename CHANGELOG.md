# Changelog

## v0.7.0

### Added

- `modules/availability` takes `site_down_alarm` (`evaluation_periods = 3`, `datapoints_to_alarm = 2` by default, so today's alarm). `{ datapoints_to_alarm = 1 }` alarms on any bad minute.

### Changed

- With `canary_enabled = false`, the per-minute schedule runs a backfill: for the minute two behind now it writes `SiteUp = 0` if the publisher sent nothing. A silent publisher now alarms, about 3 minutes after it stops, and counts against uptime like a failing probe. CloudWatch ignores `treat_missing_data` while enough real datapoints exist in its evaluation range, so a short silence never alarmed before.
- The schedule rule, target and permission are no longer count-gated and are named `schedule`.

### Upgrade

- Applying replaces the schedule rule and the Lambda permission (the rule is now named `<name_prefix>-availability-schedule`). `moved` blocks keep the state; nothing else changes. With `canary_enabled = true` behavior is unchanged.

## v0.6.0

### Added

- `modules/availability` takes `planned_causes` (default: rightsize, deploy, instance-refresh, capacity-change, backup). Episodes with a listed cause are recorded as planned and left out of the status page's uptime series. An empty list counts every outage.

### Upgrade

- No action. The default keeps today's behavior.

## v0.5.0

### Fixed

- A publisher that goes silent when down (a heartbeat with no canary) now records the whole outage: the minutes with no datapoint count as down. Before, an episode began at the first explicit zero, so a 26-minute outage was recorded as one minute.
- The RECOVERED email sent when no outage was recorded no longer claims the environment slept; it says no outage was recorded, with both possible reasons.

### Changed

- The status page omits the Data volume and Media columns of the Storage card, and the Commit and Base rows of the machine image, when the payload has no value for them, instead of showing dashes.

### Upgrade

- No action.

## v0.4.0

### Added

- `modules/availability` takes `canary_enabled` (default `true`). With `false`, the canary rule, target and permission are not created and the Lambda ignores scheduled events, so an external publisher can send `SiteUp` every minute. The `site_down` alarm still treats silence as down; its description names the heartbeat.

### Upgrade

- No action. Terraform maps the existing canary resources to index `[0]` without a `moved` block (checked with `terraform plan`: no changes).

## v0.3.2

### Fixed

- The cost panel no longer calls Cost Explorer on the 1st of the month, when the period would be empty and Cost Explorer rejects it; it reports a zero month-to-date until the 2nd.
- `modules/availability` reads the cause markers through `tolerant()`. An unreadable or non-JSON marker no longer loses the DOWN email or misfiles the outage as a wake. The RECOVERED email's ASG instance and last-activity lookups degrade to absent the same way.
- `modules/host-alarms`: the recent-episodes dashboard table and the `downtime-by-cause` and `outage-episodes` saved queries filter to the `episodes` stream, so change-log lines no longer count as outages.

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
