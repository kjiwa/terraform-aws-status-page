import type { Facts as FactsData, PanelError } from '../../generated/status-payload';
import { numOrDash } from '../../shared/format';
import { Card, ErrNote } from '../ui/Card';
import { Kv, type KvValue } from '../ui/Kv';

type Row = FactsData['rows'][number];

/** The section key as a card title, for a PanelError that carries no title of its own. */
export function titleFromKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function valueCell(row: Row): KvValue {
  const value = typeof row.value === 'number' ? numOrDash(row.value) : row.value;
  if (!row.caption) return value;
  const empty = value === null || value === '';
  return (
    <>
      {empty ? '—' : value}
      <span class="caption">{row.caption}</span>
    </>
  );
}

/** One app-supplied section: a title and label/value rows with an optional caption under each value. */
export function Facts({ d, name }: { d: FactsData | PanelError; name: string }) {
  if ('error' in d) {
    return (
      <Card title={titleFromKey(name)}>
        <ErrNote message={d.error} />
      </Card>
    );
  }
  return (
    <Card title={d.title}>
      {d.rows.length === 0 ? (
        <p class="note">Nothing to show.</p>
      ) : (
        <Kv pairs={d.rows.map((r) => [r.label, valueCell(r)])} />
      )}
    </Card>
  );
}
