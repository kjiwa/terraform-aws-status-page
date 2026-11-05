import type { Episode, Interruption, PanelError } from '../generated/status-payload';
import type { TimeWindow } from './ranges';

/** Fewest outages carrying both anchors before the recovery split draws a bar. */
export const SPLIT_MIN_EPISODES = 3;
export const POOL_ROWS = 6;

export interface SpotSummary {
  reclaims: number;
  outages: number;
  downtimeShare: number | null;
}

export interface RecoverySplit {
  count: number;
  warningToLaunchS: number;
  launchToServeS: number;
}

export interface PoolRow {
  type: string;
  az: string;
  reclaims: number;
  medianLifetimeS: number | null;
  last: string;
}

export interface SpotData {
  episodes: Episode[];
  warnings: Interruption[];
}

function rows<T>(d: T[] | PanelError | undefined): T[] {
  return Array.isArray(d) ? d : [];
}

export function spotData(
  incidents: Episode[] | PanelError | undefined,
  interruptions: Interruption[] | PanelError | undefined,
): SpotData {
  return {
    episodes: rows(incidents),
    warnings: rows(interruptions),
  };
}

export function isSpotEpisode(ep: Episode): boolean {
  return ep.cause === 'spot-reclaim';
}

/** The panel shows for a Spot deployment, or wherever the payload's year holds any trace of a reclaim. */
export function hasSpotActivity(data: SpotData): boolean {
  return data.warnings.length > 0 || data.episodes.some(isSpotEpisode);
}

function inWindow(iso: string, w: TimeWindow): boolean {
  const t = Date.parse(iso);
  return t >= w.startMs && t <= w.endMs;
}

export function warningsIn(data: SpotData, w: TimeWindow): Interruption[] {
  return data.warnings.filter((x) => inWindow(x.time, w));
}

export function episodesIn(data: SpotData, w: TimeWindow): Episode[] {
  return data.episodes.filter((ep) => inWindow(ep.started, w));
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] ?? null)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Nearest rank: the smallest value at or above fraction p of the sample. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? null;
}

export function summarize(data: SpotData, w: TimeWindow): SpotSummary {
  const all = episodesIn(data, w);
  const spotDownS = all.filter(isSpotEpisode).reduce((a, ep) => a + ep.duration_s, 0);
  const totalS = all.reduce((a, ep) => a + ep.duration_s, 0);
  return {
    reclaims: warningsIn(data, w).length,
    outages: all.filter(isSpotEpisode).length,
    downtimeShare: totalS > 0 ? (spotDownS / totalS) * 100 : null,
  };
}

function servedAtMs(ep: Episode): number {
  return ep.ended ? Date.parse(ep.ended) : Date.parse(ep.started) + ep.duration_s * 1000;
}

interface Segments {
  warningToLaunchS: number;
  launchToServeS: number;
}

/** Warning to replacement launch, then launch to serving; null when the episode lacks either anchor. */
function segmentsOf(ep: Episode): Segments | null {
  const warning = ep.old_instance?.time;
  const launched = ep.new_instance?.launched;
  if (!warning || !launched) return null;
  const warningMs = Date.parse(warning);
  const launchMs = Date.parse(launched);
  const servedMs = servedAtMs(ep);
  if (![warningMs, launchMs, servedMs].every(Number.isFinite)) return null;
  return {
    warningToLaunchS: Math.max(0, (launchMs - warningMs) / 1000),
    launchToServeS: Math.max(0, (servedMs - launchMs) / 1000),
  };
}

/** Medians over the outages carrying a warning and a launch time; null below SPLIT_MIN_EPISODES. */
export function recoverySplit(episodes: Episode[]): { timed: number; split: RecoverySplit | null } {
  const segments = episodes.map(segmentsOf).filter((x): x is Segments => x !== null);
  const warningToLaunchS = median(segments.map((x) => x.warningToLaunchS));
  const launchToServeS = median(segments.map((x) => x.launchToServeS));
  if (
    segments.length < SPLIT_MIN_EPISODES ||
    warningToLaunchS === null ||
    launchToServeS === null
  ) {
    return { timed: segments.length, split: null };
  }
  return {
    timed: segments.length,
    split: { count: segments.length, warningToLaunchS, launchToServeS },
  };
}

function lifetimeS(ep: Episode): number | null {
  const old = ep.old_instance;
  if (!old || !old.time) return null;
  const s = (Date.parse(old.time) - Date.parse(old.launched)) / 1000;
  return s >= 0 ? s : null;
}

interface PoolGroup {
  type: string;
  az: string;
  episodes: Episode[];
}

function poolRow(type: string, az: string, eps: Episode[]): PoolRow {
  const lifetimes = eps.map(lifetimeS).filter((s): s is number => s !== null);
  return {
    type,
    az,
    reclaims: eps.length,
    medianLifetimeS: median(lifetimes),
    last: eps.map((ep) => ep.started).reduce((a, b) => (a > b ? a : b)),
  };
}

function poolGroups(episodes: Episode[]): PoolGroup[] {
  const groups = new Map<string, PoolGroup>();
  episodes.forEach((ep) => {
    const old = ep.old_instance;
    const type = old ? old.type : 'unknown';
    const az = old ? old.az : '—';
    const key = `${type}\u0000${az}`;
    const group = groups.get(key) ?? { type, az, episodes: [] };
    group.episodes.push(ep);
    groups.set(key, group);
  });
  return [...groups.values()];
}

/**
 * Reclaims grouped by the instance that was lost, most first, then one
 * "Other" row folding the tail when it holds two or more pools. An episode without an old_instance record
 * is a reclaim of an unknown pool, not a missing one.
 */
export function poolTable(episodes: Episode[], limit = POOL_ROWS): PoolRow[] {
  const ranked = poolGroups(episodes)
    .map((group) => ({ group, row: poolRow(group.type, group.az, group.episodes) }))
    .sort((a, b) => b.row.reclaims - a.row.reclaims || (a.row.last < b.row.last ? 1 : -1));
  if (ranked.length <= limit) return ranked.map((r) => r.row);
  const head = ranked.slice(0, limit).map((r) => r.row);
  const tail = ranked.slice(limit);
  const [only] = tail;
  if (only && tail.length === 1) return [...head, only.row];
  return [
    ...head,
    poolRow(
      'Other',
      '',
      tail.flatMap((r) => r.group.episodes),
    ),
  ];
}
