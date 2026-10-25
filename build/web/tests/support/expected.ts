/**
 * The expected `.card > h3` and `.section-head` sets for a given toggle and
 * disabledPanels set, derived from App.tsx's render order and heading rules.
 * Shared by status-matrix.test.ts (jsdom, every toggle combination) and
 * status-render.spec.ts (Playwright) so the two suites' notion of "what should
 * be on screen" can't drift apart.
 */
import type { Toggles } from './shell.ts';

/** The title of the one app section in the fixture payload. */
export const APP_SECTION_TITLE = 'Release';

export function expectedSections(t: Toggles, disabled: readonly string[] = []): string[] {
  const on = (name: string) => !disabled.includes(name);
  const sections: string[] = [];
  if (on('reliability') || on('incidents')) sections.push('Service');
  if ((t.deployment && on('deployment')) || on('image') || on('changes')) sections.push('Delivery');
  if ((t.backups && on('backups')) || on('storage')) sections.push('Data');
  if (on('host') || (t.bedrock && on('bedrock'))) sections.push('Runtime');
  if (t.cost && on('cost')) sections.push('Spend');
  if (t.app && on('release')) sections.push('Application');
  return sections;
}

/**
 * host_metrics merges into the Host/Storage cards rather than gating a card
 * of its own, so it is deliberately absent here. public_reliability affects
 * the /public route, never the authenticated card set.
 */
export function expectedCards(t: Toggles, disabled: readonly string[] = []): string[] {
  const on = (name: string) => !disabled.includes(name);
  const cards: string[] = [];
  if (on('reliability')) cards.push('Reliability');
  if (on('incidents')) cards.push('Incidents');
  if (t.deployment && on('deployment')) cards.push('Deployment');
  else if (on('image')) cards.push('Machine image');
  if (on('changes')) cards.push('Changes');
  if (t.backups && on('backups')) cards.push('Backups');
  if (on('storage')) cards.push('Storage');
  if (on('host')) cards.push('Host');
  if (t.bedrock && on('bedrock')) cards.push('Bedrock');
  if (t.cost && on('cost')) cards.push('Cost (month to date)');
  if (t.app && on('release')) cards.push(APP_SECTION_TITLE);
  return cards;
}
