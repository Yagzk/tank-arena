import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startGameServer, type GameServer } from './server';
import { SnapshotDecoder } from '../src/network/codec';
import type { ServerMessage } from '../src/network/protocol';

/** A client that records everything the server says. */
class TestClient {
  public messages: ServerMessage[] = [];
  public closed = false;
  public closeCode = 0;
  private socket: WebSocket;
  private waiters: Array<() => void> = [];

  constructor(url: string, origin?: string) {
    this.socket = new WebSocket(url, origin ? { origin } : undefined);
    this.socket.on('message', data => {
      this.messages.push(JSON.parse(data.toString()) as ServerMessage);
      this.waiters.splice(0).forEach(w => w());
    });
    this.socket.on('close', code => {
      this.closed = true;
      this.closeCode = code;
      this.waiters.splice(0).forEach(w => w());
    });
    this.socket.on('error', () => undefined);
  }

  opened(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket.readyState === WebSocket.OPEN) return resolve();
      this.socket.once('open', () => resolve());
      this.socket.once('error', reject);
      this.socket.once('close', () => resolve());
    });
  }

  send(message: unknown) {
    this.socket.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  sendRaw(data: string | Buffer) {
    this.socket.send(data);
  }

  /** Resolves with the first message matching, new or already received. */
  async wait<T extends ServerMessage['t']>(type: T, timeoutMs = 3000): Promise<Extract<ServerMessage, { t: T }>> {
    const started = Date.now();
    for (;;) {
      const found = this.messages.find(m => m.t === type);
      if (found) return found as never;
      if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for ' + type);
      await new Promise<void>(resolve => {
        this.waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }

  of(type: ServerMessage['t']): ServerMessage[] {
    return this.messages.filter(m => m.t === type);
  }

  close() {
    this.socket.close();
  }
}

describe('the game server over real sockets', () => {
  let server: GameServer;
  let url: string;
  const clients: TestClient[] = [];

  async function connect(origin?: string): Promise<TestClient> {
    const c = new TestClient(url, origin);
    clients.push(c);
    await c.opened();
    return c;
  }

  beforeEach(async () => {
    server = await startGameServer({ port: 0, host: '127.0.0.1' });
    url = 'ws://127.0.0.1:' + server.port;
  });

  afterEach(async () => {
    clients.splice(0).forEach(c => c.close());
    await server.close();
  });

  it('creates a room and tells the creator its code', async () => {
    const a = await connect();
    a.send({ t: 'create', name: 'Ali', brawler: 'mira', mode: 'showdown' });
    const joined = await a.wait('joined');
    expect(joined.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(server.roomCount).toBe(1);
  });

  it('lets a second player join by code and shows both of them the roster', async () => {
    const a = await connect();
    a.send({ t: 'create', name: 'Ali', brawler: 'mira', mode: 'showdown' });
    const { code } = await a.wait('joined');

    const b = await connect();
    b.send({ t: 'join', code: code.toLowerCase(), name: 'Veli', brawler: 'rivet' });
    await b.wait('joined');

    // Both see two players.
    for (const c of [a, b]) {
      for (let i = 0; i < 40 && !c.messages.some(m => m.t === 'room' && m.players.length === 2); i++) {
        await new Promise(r => setTimeout(r, 25));
      }
      const room = [...c.messages].reverse().find(m => m.t === 'room');
      expect(room && room.t === 'room' && room.players.map(p => p.name).sort()).toEqual(['Ali', 'Veli']);
    }
  });

  it('says so when the code is wrong', async () => {
    const a = await connect();
    a.send({ t: 'join', code: 'ZZZZ', name: 'Ali', brawler: 'mira' });
    const err = await a.wait('error');
    expect(err.message).toMatch(/bulunamadı/);
  });

  it('plays a round: start, state, input, and back to the room', async () => {
    const owner = await connect();
    owner.send({ t: 'create', name: 'Ali', brawler: 'mira', mode: 'showdown' });
    const { code } = await owner.wait('joined');

    const guest = await connect();
    guest.send({ t: 'join', code, name: 'Veli', brawler: 'rivet' });
    await guest.wait('joined');

    owner.send({ t: 'addBot' });
    owner.send({ t: 'addBot' });
    await new Promise(r => setTimeout(r, 100));
    owner.send({ t: 'start' });

    await owner.wait('start');
    await guest.wait('start');
    await guest.wait('state');

    // Let it run, then rebuild the world from what arrived.
    await new Promise(r => setTimeout(r, 600));
    const decoder = new SnapshotDecoder();
    let last = null;
    for (const m of guest.messages) if (m.t === 'state') last = decoder.decode(m.s);
    expect(last).not.toBeNull();
    expect(last!.brawlers).toHaveLength(4);
    expect(last!.walls.length).toBeGreaterThan(20);

    // A steady stream (about thirty a second), allowing for a busy machine.
    expect(guest.of('state').length).toBeGreaterThan(6);

    owner.send({ t: 'lobby' });
    await owner.wait('lobby');
    await guest.wait('lobby');
    expect(server.status().matches).toBe(0);
    expect(server.roomCount).toBe(1);
  });

  it('answers a ping', async () => {
    const a = await connect();
    a.send({ t: 'ping', ts: 777 });
    expect((await a.wait('pong')).ts).toBe(777);
  });

  it('forgets a room when its last player disconnects', async () => {
    const a = await connect();
    a.send({ t: 'create', name: 'Ali', brawler: 'mira', mode: 'showdown' });
    await a.wait('joined');
    expect(server.roomCount).toBe(1);

    a.close();
    for (let i = 0; i < 40 && server.roomCount > 0; i++) await new Promise(r => setTimeout(r, 25));
    expect(server.roomCount).toBe(0);
  });

  describe('hostile clients', () => {
    it('ignores garbage without dropping the connection', async () => {
      const a = await connect();
      a.sendRaw('not json at all');
      a.sendRaw('{"t":"constructor"}');
      a.sendRaw('null');
      a.sendRaw('[1,2,3]');
      a.send({ t: 'create', name: 'Ali', brawler: 'nope', mode: 'showdown' });
      // Still alive, and still served.
      a.send({ t: 'ping', ts: 1 });
      expect((await a.wait('pong')).ts).toBe(1);
      expect(a.closed).toBe(false);
    });

    it('hangs up on a message far larger than anything real', async () => {
      const a = await connect();
      a.sendRaw('x'.repeat(100_000));
      for (let i = 0; i < 40 && !a.closed; i++) await new Promise(r => setTimeout(r, 25));
      expect(a.closed).toBe(true);
    });

    it('does not let a stranger act as the owner of somebody else\'s room', async () => {
      const owner = await connect();
      owner.send({ t: 'create', name: 'Ali', brawler: 'mira', mode: 'showdown' });
      const { code } = await owner.wait('joined');

      const intruder = await connect();
      intruder.send({ t: 'start' });
      intruder.send({ t: 'addBot' });
      intruder.send({ t: 'remove', id: 'anyone' });
      await new Promise(r => setTimeout(r, 100));

      // The intruder is in no room, so none of that reached one.
      expect(server.status().matches).toBe(0);
      const roomMessages = owner.of('room');
      const last = roomMessages[roomMessages.length - 1];
      expect(last && last.t === 'room' && last.players).toHaveLength(1);
      void code;
    });

    it('refuses a second room from somebody already in one', async () => {
      const a = await connect();
      a.send({ t: 'create', name: 'Ali', brawler: 'mira', mode: 'showdown' });
      await a.wait('joined');
      a.send({ t: 'create', name: 'Ali', brawler: 'mira', mode: 'showdown' });
      a.send({ t: 'create', name: 'Ali', brawler: 'mira', mode: 'showdown' });
      await new Promise(r => setTimeout(r, 100));
      expect(server.roomCount).toBe(1);
    });
  });
});

describe('server limits', () => {
  it('stops creating rooms at the cap, and says so', async () => {
    const server = await startGameServer({ port: 0, host: '127.0.0.1', maxRooms: 2 });
    const url = 'ws://127.0.0.1:' + server.port;
    const made: TestClient[] = [];
    try {
      for (let i = 0; i < 3; i++) {
        const c = new TestClient(url);
        made.push(c);
        await c.opened();
        c.send({ t: 'create', name: 'P' + i, brawler: 'mira', mode: 'showdown' });
        if (i < 2) await c.wait('joined');
      }
      const refused = await made[2].wait('error');
      expect(refused.message).toMatch(/dolu/);
      expect(server.roomCount).toBe(2);
    } finally {
      made.forEach(c => c.close());
      await server.close();
    }
  });

  it('limits connections from one address', async () => {
    const server = await startGameServer({ port: 0, host: '127.0.0.1', maxConnectionsPerIp: 2 });
    const url = 'ws://127.0.0.1:' + server.port;
    const made: TestClient[] = [];
    try {
      for (let i = 0; i < 3; i++) {
        const c = new TestClient(url);
        made.push(c);
        await c.opened();
      }
      for (let i = 0; i < 40 && !made[2].closed; i++) await new Promise(r => setTimeout(r, 25));
      expect(made[2].closed).toBe(true);
      expect(made[0].closed).toBe(false);
    } finally {
      made.forEach(c => c.close());
      await server.close();
    }
  });

  it('refuses an origin that is not on the list', async () => {
    const server = await startGameServer({
      port: 0,
      host: '127.0.0.1',
      allowedOrigins: ['https://oyun.example.com'],
    });
    const url = 'ws://127.0.0.1:' + server.port;
    try {
      // Refused during the handshake, before it is ever a connection.
      const stranger = new TestClient(url, 'https://evil.example.org');
      await expect(stranger.opened()).rejects.toThrow(/401/);

      const friend = new TestClient(url, 'https://oyun.example.com');
      await friend.opened();
      friend.send({ t: 'ping', ts: 5 });
      expect((await friend.wait('pong')).ts).toBe(5);
      friend.close();
    } finally {
      await server.close();
    }
  });
});
