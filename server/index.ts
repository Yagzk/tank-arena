/**
 * Starts the game server.
 *
 *   npm run server
 *
 * Settings come from the environment, so the same build runs anywhere:
 *   PORT              port to listen on                       (default 8787)
 *   HOST              address to bind                         (default 0.0.0.0)
 *   ALLOWED_ORIGINS   comma-separated origins allowed to play (default: any)
 *   MAX_ROOMS         rooms held at once                      (default 200)
 */

import { startGameServer } from './server';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const maxRooms = Number(process.env.MAX_ROOMS ?? 200);

const server = await startGameServer({ port, host, allowedOrigins, maxRooms });
console.log(
  `Nova Arena sunucusu ${host}:${server.port} üzerinde çalışıyor` +
    (allowedOrigins.length ? ` (izinli kaynaklar: ${allowedOrigins.join(', ')})` : ' (tüm kaynaklara açık)')
);

// A plain status line every minute, so a glance at the logs shows whether the
// server is busy and whether any client's connection is struggling.
setInterval(() => console.log('durum', JSON.stringify(server.status())), 60_000).unref();

const shutdown = async () => {
  console.log('Kapatılıyor…');
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
