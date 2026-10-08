/**
 * Where the game server is, if there is one.
 *
 * With a server configured, rooms live on it and nobody's browser runs a
 * match. With none, the game falls back to peer-to-peer rooms hosted in a
 * player's browser, which is how it worked before the server existed and is
 * still what you get for a quick game with nothing deployed.
 *
 * In order of precedence:
 *   ?server=host:port        in the address bar, to point one session at a server
 *   VITE_GAME_SERVER         baked in at build time, for a deployment
 */

/** Turns what a person might type into a socket address, or null for none. */
export function normaliseServerUrl(raw: string | null | undefined, pageProtocol = 'http:'): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  if (/^wss?:\/\//i.test(value)) return value;
  // A page served over https may only open secure sockets; the browser blocks
  // anything else as mixed content, so default to the one that can work.
  const scheme = pageProtocol === 'https:' ? 'wss' : 'ws';
  return scheme + '://' + value.replace(/^\/+/, '');
}

export function getServerUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const fromQuery = new URLSearchParams(window.location.search).get('server');
  const fromBuild = (import.meta.env?.VITE_GAME_SERVER as string | undefined) ?? '';
  return normaliseServerUrl(fromQuery || fromBuild, window.location.protocol);
}
