import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { canSignIn, fetchStatusData, tryPublic, type PublicData } from './api';
import { config } from './config';
import type { GETStatusDataResponse } from '../generated/status-payload';
import { Gate, type GateKind, type GateState } from './gate';
import { Backups } from './panels/Backups';
import { Changes } from './panels/Changes';
import { Bedrock } from './panels/Bedrock';
import { Cost } from './panels/Cost';
import { Deployment, deploymentTitle } from './panels/Deployment';
import { Facts, titleFromKey } from './panels/Facts';
import { Host } from './panels/Host';
import { Incidents } from './panels/Incidents';
import { Reliability } from './panels/Reliability';
import { Storage } from './panels/Storage';
import { RetryContext } from './ui/Card';
import { PanelBoundary } from './ui/PanelBoundary';
import { Section } from './ui/Section';

/**
 * Status application state machine. `#skeleton`, `#who`, and `#gate` are DOM
 * siblings of `#panels`, not descendants -- Preact's render() corrupts a
 * container that already holds foreign DOM, so this component owns them via
 * plain DOM calls/a second render() call in useEffects, and returns JSX only
 * for `#panels`' own content.
 */

type AppState =
  | { phase: 'loading' }
  | { phase: 'data'; data: GETStatusDataResponse }
  | { phase: 'public'; data: PublicData; gate: GateState }
  | { phase: 'gate'; gate: GateState };

/** tryPublic(gateKind, extra): the fetch+classify lives in api.ts, the
 * resulting DOM/state decision here. */
async function resolveTryPublic(gateKind: GateKind, extra?: string | number): Promise<AppState> {
  const result = await tryPublic();
  if (result.ok) return { phase: 'public', data: result.data, gate: { kind: gateKind, extra } };
  if (result.reason === 'network-error') return { phase: 'gate', gate: { kind: 'error' } };
  // 404: the feature is off, not that this visitor did anything wrong --
  // but it's still this call's own gateKind/extra that decides what the
  // visitor sees next.
  if (result.reason === 'not-configured') return { phase: 'gate', gate: { kind: gateKind, extra } };
  return { phase: 'gate', gate: { kind: 'error', extra: result.status } };
}

async function computeState(): Promise<AppState> {
  if (!canSignIn()) return resolveTryPublic('signin');
  let r: Awaited<ReturnType<typeof fetchStatusData>>;
  try {
    r = await fetchStatusData();
  } catch {
    return { phase: 'gate', gate: { kind: 'error' } };
  }
  if (r.status === 401) return resolveTryPublic('signin');
  if (r.status === 403) return resolveTryPublic('forbidden');
  if (!r.ok) return { phase: 'gate', gate: { kind: 'error', extra: r.status } };
  let data: GETStatusDataResponse;
  try {
    data = (await r.json()) as GETStatusDataResponse;
  } catch {
    return { phase: 'gate', gate: { kind: 'error', extra: r.status } };
  }
  return { phase: 'data', data };
}

async function loadState(): Promise<AppState> {
  try {
    return await computeState();
  } catch {
    return { phase: 'gate', gate: { kind: 'error' } };
  }
}

export function App() {
  const [state, setState] = useState<AppState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void loadState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A failed refetch keeps the panels already on screen; any other outcome
  // (data, sign-in, forbidden) replaces them.
  const retry = () =>
    void loadState().then((next) =>
      setState((prev) =>
        next.phase === 'gate' && next.gate.kind === 'error' && prev.phase !== 'gate' ? prev : next,
      ),
    );

  // Owns skeleton removal: the moment state transitions out of "loading",
  // remove #skeleton via a plain DOM call -- #skeleton is a dedicated sibling,
  // plainly removed, never touched by Preact's render().
  useEffect(() => {
    if (state.phase === 'loading') return;
    document.getElementById('skeleton')?.remove();
  }, [state.phase]);

  // #who is a sibling of #panels too (inside <header>), so it's set the
  // same imperative way. "loading" and "gate" (no public data) leave it
  // untouched, so it stays the empty string the static shell ships.
  useEffect(() => {
    const whoEl = document.getElementById('who');
    if (!whoEl) return;
    if (state.phase === 'data') {
      const { data } = state;
      whoEl.textContent = `Signed in as ${data.caller_role || '?'}`;
    } else if (state.phase === 'public') {
      whoEl.textContent = 'Public reliability snapshot';
    }
  }, [state]);

  // #gate is a third sibling. Gate is one-shot in the original too: once
  // shown, "hidden" is never restored, and no other phase calls this --
  // so a second, independent render() call (plain 'preact', not a
  // preact/compat portal -- measured ~2.85 KB gzipped heavier for a
  // feature this doesn't need) is exactly as correct as a portal here and
  // costs nothing extra in the bundle.
  useEffect(() => {
    if (state.phase !== 'public' && state.phase !== 'gate') return;
    const gateEl = document.getElementById('gate');
    if (!gateEl) return;
    render(<Gate kind={state.gate.kind} extra={state.gate.extra} />, gateEl);
    gateEl.classList.remove('hidden');
  }, [state]);

  if (state.phase === 'loading' || state.phase === 'gate') return null;

  const disabled = config().disabledPanels;
  const on = (name: string) => !disabled.includes(name);
  // A disabled panel is passed as undefined, which every panel renders as nothing.
  const pick = <T,>(name: string, value: T | undefined): T | undefined =>
    on(name) ? value : undefined;

  if (state.phase === 'public') {
    const { data } = state;
    // Deliberately no section heading: a single group needs none.
    return (
      <RetryContext.Provider value={retry}>
        <PanelBoundary resetKey={data} title="Reliability">
          <Reliability d={pick('reliability', data.reliability)} episodes={data.incidents} />
        </PanelBoundary>
        <PanelBoundary resetKey={data} title="Incidents">
          <Incidents
            d={pick('incidents', data.incidents)}
            interruptions={pick('interruptions', data.interruptions)}
            spotEnabled={data.spot_enabled}
            hideSpot={!on('interruptions')}
          />
        </PanelBoundary>
        <PanelBoundary resetKey={data} title="Changes">
          <Changes d={pick('changes', data.changes)} />
        </PanelBoundary>
      </RetryContext.Provider>
    );
  }

  // Section order tells the page's story top to bottom: what visitors get
  // (Service), how it ships (Delivery), what it holds (Data), what it runs
  // on (Runtime), what it costs (Spend), then the app's own sections. A
  // heading renders only when at least one panel under it does.
  const { data } = state;
  const deployment = pick('deployment', data.deployment);
  const image = pick('image', data.image);
  const backups = pick('backups', data.backups);
  const bedrock = pick('bedrock', data.bedrock);
  const cost = pick('cost', data.cost);
  const hostMetrics = pick('host_metrics', data.host_metrics);
  const appSections = Object.entries(data.app).filter(([name]) => on(name));
  const showService = on('reliability') || on('incidents');
  const showDelivery = !!deployment || !!image || on('changes');
  const showData = !!backups || on('storage');
  const showRuntime = on('host') || !!bedrock;
  return (
    <RetryContext.Provider value={retry}>
      {showService && <Section title="Service" />}
      <PanelBoundary resetKey={data} title="Reliability">
        <Reliability d={pick('reliability', data.reliability)} episodes={data.incidents} canPan />
      </PanelBoundary>
      <PanelBoundary resetKey={data} title="Incidents">
        <Incidents
          d={pick('incidents', data.incidents)}
          interruptions={pick('interruptions', data.interruptions)}
          spotEnabled={data.spot_enabled}
          hideSpot={!on('interruptions')}
          operator
        />
      </PanelBoundary>

      {showDelivery && <Section title="Delivery" />}
      <PanelBoundary resetKey={data} title={deploymentTitle(deployment)}>
        <Deployment d={deployment} image={image} repo={data.source_repo} />
      </PanelBoundary>
      <PanelBoundary resetKey={data} title="Changes">
        <Changes d={pick('changes', data.changes)} />
      </PanelBoundary>

      {showData && <Section title="Data" />}
      {backups && (
        <PanelBoundary resetKey={data} title="Backups">
          <Backups d={backups} />
        </PanelBoundary>
      )}
      <PanelBoundary resetKey={data} title="Storage">
        <Storage d={pick('storage', data.storage)} m={hostMetrics} canPan />
      </PanelBoundary>

      {showRuntime && <Section title="Runtime" />}
      <PanelBoundary resetKey={data} title="Host">
        <Host d={pick('host', data.host)} m={hostMetrics} canPan />
      </PanelBoundary>
      {bedrock && (
        <PanelBoundary resetKey={data} title="Bedrock">
          <Bedrock d={bedrock} canPan />
        </PanelBoundary>
      )}

      {cost && (
        <>
          <Section title="Spend" />
          <PanelBoundary resetKey={data} title="Cost (month to date)">
            <Cost d={cost} />
          </PanelBoundary>
        </>
      )}

      {appSections.length > 0 && <Section title="Application" />}
      {appSections.map(([name, section]) => (
        <PanelBoundary
          key={name}
          resetKey={data}
          title={'error' in section ? titleFromKey(name) : section.title}
        >
          <Facts d={section} name={name} />
        </PanelBoundary>
      ))}
    </RetryContext.Provider>
  );
}
