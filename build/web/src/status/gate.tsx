import { config } from './config';

export type GateKind = 'signin' | 'forbidden' | 'error';

export interface GateState {
  kind: GateKind;
  extra?: string | number;
}

export function Gate({ kind, extra }: GateState) {
  let h: string;
  let p: string;
  let link: string | null = null;
  if (kind === 'signin') {
    h = 'Please sign in';
    p = 'Sign in, then come back to this page.';
    link = config().signInUrl;
  } else if (kind === 'forbidden') {
    h = 'Insufficient permissions';
    p = 'Your account is not permitted to view this page.';
  } else {
    h = "Couldn't load status";
    p = `The server returned an error${extra ? ` (${extra})` : ''}. Please try again shortly.`;
  }
  return (
    <div>
      <h2>{h}</h2>
      <p>{p}</p>
      {link && (
        <a class="btn" href={link}>
          Sign in
        </a>
      )}
    </div>
  );
}
