import { Kv, type KvValue } from './Kv';

/** Raw AWS ids, kept out of the way: they identify a resource for support, not for reading. */
export function Identifiers({ pairs }: { pairs: [string, KvValue][] }) {
  return (
    <details>
      <summary>Identifiers</summary>
      <Kv pairs={pairs} />
    </details>
  );
}
