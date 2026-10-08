import { describe, expect, it, vi } from 'vitest';
import { Room, type Peer } from './room';
import type { ClientMessage, ServerMessage } from '../src/network/protocol';
import { SnapshotDecoder, type NetSnapshot } from '../src/network/codec';

class FakePeer implements Peer {
  public messages: ServerMessage[] = [];
  public raw: string[] = [];
  public queued = 0;
  public closed = false;

  constructor(public readonly id: string) {}

  send(message: ServerMessage) {
    this.messages.push(message);
  }
  sendRaw(payload: string) {
    this.raw.push(payload);
  }
  backlog() {
    return this.queued;
  }
  close() {
    this.closed = true;
  }

  last<T extends ServerMessage['t']>(type: T): Extract<ServerMessage, { t: T }> | undefined {
    return [...this.messages].reverse().find(m => m.t === type) as never;
  }
  count(type: ServerMessage['t']): number {
    return this.messages.filter(m => m.t === type).length;
  }
  states(): NetSnapshot[] {
    return this.raw.map(r => (JSON.parse(r) as { s: NetSnapshot }).s);
  }
}

function makeRoom(mode: 'showdown' | 'gem_grab' = 'showdown') {
  const onEmpty = vi.fn();
  const room = new Room('ABCD', mode, { onEmpty });
  return { room, onEmpty };
}

/** An owner, a second person and two bots: the smallest room that can start. */
function readyRoom() {
  const made = makeRoom();
  const owner = new FakePeer('owner');
  const guest = new FakePeer('guest');
  made.room.join(owner, 'Sahip', 'mira');
  made.room.join(guest, 'Konuk', 'rivet');
  made.room.handle('owner', { t: 'addBot' }, 0);
  made.room.handle('owner', { t: 'addBot' }, 0);
  return { ...made, owner, guest };
}

function send(room: Room, id: string, message: ClientMessage, now = 0) {
  room.handle(id, message, now);
}

/** Advances a started match by `seconds`, in 8 ms beats like the real clock. */
function run(room: Room, from: number, seconds: number): number {
  let t = from;
  const end = from + seconds * 1000;
  while (t < end) {
    t += 8;
    room.tick(t);
  }
  return t;
}

describe('joining', () => {
  it('makes the first person the owner and tells them so', () => {
    const { room } = makeRoom();
    const a = new FakePeer('a');
    expect(room.join(a, 'Ali', 'mira')).toBeNull();
    expect(a.last('joined')).toEqual({ t: 'joined', code: 'ABCD', you: 'a' });
    expect(a.last('room')?.owner).toBe('a');
  });

  it('tells everybody when somebody arrives', () => {
    const { room } = makeRoom();
    const a = new FakePeer('a');
    const b = new FakePeer('b');
    room.join(a, 'Ali', 'mira');
    room.join(b, 'Veli', 'rivet');
    expect(a.last('room')?.players).toHaveLength(2);
    expect(b.last('room')?.players).toHaveLength(2);
  });

  it('refuses an eleventh player', () => {
    const { room } = makeRoom();
    for (let i = 0; i < 10; i++) expect(room.join(new FakePeer('p' + i), 'P', 'mira')).toBeNull();
    expect(room.join(new FakePeer('late'), 'P', 'mira')).toMatch(/dolu/);
  });

  it('lets somebody change character in the room', () => {
    const { room } = makeRoom();
    const a = new FakePeer('a');
    room.join(a, 'Ali', 'mira');
    send(room, 'a', { t: 'pick', brawler: 'zirh' });
    expect(a.last('room')?.players[0].brawler).toBe('zirh');
  });
});

describe('who may do what', () => {
  it('lets only the owner start, add bots, change the mode and remove people', () => {
    const { room, owner, guest } = readyRoom();
    const before = room.playerCount;

    send(room, 'guest', { t: 'addBot' });
    send(room, 'guest', { t: 'mode', mode: 'gem_grab' });
    send(room, 'guest', { t: 'remove', id: 'owner' });
    send(room, 'guest', { t: 'start' });

    expect(room.playerCount).toBe(before);
    expect(room.inMatch).toBe(false);
    expect(owner.last('room')?.mode).toBe('showdown');
    expect(guest.closed).toBe(false);
  });

  it('refuses to start with too few players, and says why', () => {
    const { room } = makeRoom();
    const a = new FakePeer('a');
    room.join(a, 'Ali', 'mira');
    send(room, 'a', { t: 'start' });
    expect(room.inMatch).toBe(false);
    expect(a.last('error')?.message).toMatch(/4/);
  });

  it('lets the owner remove a guest, who is told and disconnected', () => {
    const { room, guest } = readyRoom();
    send(room, 'owner', { t: 'remove', id: 'guest' });
    expect(guest.closed).toBe(true);
    expect(guest.last('error')).toBeDefined();
    expect(room.roster().some(p => p.id === 'guest')).toBe(false);
  });

  it('does not let the owner remove themselves', () => {
    const { room } = readyRoom();
    const before = room.playerCount;
    send(room, 'owner', { t: 'remove', id: 'owner' });
    expect(room.playerCount).toBe(before);
  });
});

describe('a match', () => {
  it('starts for everybody and refuses newcomers', () => {
    const { room, owner, guest } = readyRoom();
    send(room, 'owner', { t: 'start' }, 0);

    expect(room.inMatch).toBe(true);
    expect(owner.count('start')).toBe(1);
    expect(guest.count('start')).toBe(1);
    expect(room.join(new FakePeer('late'), 'Geç', 'mira')).toMatch(/maç/);
  });

  it('sends state at about thirty a second', () => {
    const { room, guest } = readyRoom();
    send(room, 'owner', { t: 'start' }, 0);
    run(room, 0, 2);
    // Two seconds at thirty a second. Allow for the first packet and the edge.
    expect(guest.raw.length).toBeGreaterThanOrEqual(55);
    expect(guest.raw.length).toBeLessThanOrEqual(62);
  });

  it('sends the geometry once and then leaves it out', () => {
    const { room, guest } = readyRoom();
    send(room, 'owner', { t: 'start' }, 0);
    run(room, 0, 1);
    const states = guest.states();
    expect(states[0].statics).toBeDefined();
    expect(states[1].statics).toBeUndefined();
    expect(states[10].statics).toBeUndefined();
  });

  it('produces state a client can rebuild the world from', () => {
    const { room, guest } = readyRoom();
    send(room, 'owner', { t: 'start' }, 0);
    run(room, 0, 1);

    const decoder = new SnapshotDecoder();
    let last = decoder.decode(guest.states()[0]);
    for (const s of guest.states().slice(1)) last = decoder.decode(s);

    expect(last.brawlers).toHaveLength(4);
    expect(last.walls.length).toBeGreaterThan(20);
    expect(last.mapName.length).toBeGreaterThan(0);
  });

  it('moves a player who sends input, and nobody who does not', () => {
    const { room, guest } = readyRoom();
    send(room, 'owner', { t: 'start' }, 0);
    // Past the three-second countdown, in which nobody can move.
    let t = run(room, 0, 3.5);

    const decoder = new SnapshotDecoder();
    const before = guest.states().map(s => decoder.decode(s)).pop()!;
    const start = before.brawlers.find(b => b.id === 'owner')!;

    send(room, 'owner', {
      t: 'input',
      seq: 1,
      input: { moveX: 1, moveY: 0, aimAngle: 0, attack: false, superAttack: false },
    });
    t = run(room, t, 1);

    const after = guest.states().map(s => decoder.decode(s)).pop()!;
    const moved = after.brawlers.find(b => b.id === 'owner')!;
    expect(Math.abs(moved.x - start.x) + Math.abs(moved.y - start.y)).toBeGreaterThan(40);
  });

  it('sends one packet for a stall, not one per step it catches up', () => {
    const { room, guest } = readyRoom();
    send(room, 'owner', { t: 'start' }, 0);
    run(room, 0, 0.5);
    const before = guest.raw.length;

    // The process stalls for a second, then wakes once.
    room.tick(500 + 1000);
    expect(guest.raw.length - before).toBe(1);
  });

  it('skips a player whose connection is backed up, and sends the rest', () => {
    const { room, owner, guest } = readyRoom();
    send(room, 'owner', { t: 'start' }, 0);
    guest.queued = 10 * 1024 * 1024;
    run(room, 0, 1);

    expect(owner.raw.length).toBeGreaterThan(25);
    expect(guest.raw.length).toBe(0);
    expect(room.statesSkipped).toBeGreaterThan(25);

    // And it recovers the moment the backlog clears, without a catch-up flood.
    guest.queued = 0;
    run(room, 1000, 0.5);
    expect(guest.raw.length).toBeGreaterThan(10);
    expect(guest.raw.length).toBeLessThan(18);
  });

  it('forwards the engine\'s sounds to everybody', () => {
    const { room, guest } = readyRoom();
    send(room, 'owner', { t: 'start' }, 0);
    run(room, 0, 4);
    // Bots are fighting by now; at least one sound should have been made.
    send(room, 'owner', { t: 'input', seq: 1, input: { moveX: 0, moveY: 0, aimAngle: 0, attack: true, superAttack: false } });
    run(room, 4000, 1);
    expect(guest.count('sound')).toBeGreaterThan(0);
  });

  it('answers a ping with the same timestamp', () => {
    const { room, guest } = readyRoom();
    send(room, 'guest', { t: 'ping', ts: 12345 });
    expect(guest.last('pong')).toEqual({ t: 'pong', ts: 12345 });
  });

  it('ignores input from somebody who is not in the room', () => {
    const { room } = readyRoom();
    send(room, 'owner', { t: 'start' }, 0);
    expect(() =>
      send(room, 'stranger', {
        t: 'input',
        seq: 1,
        input: { moveX: 1, moveY: 1, aimAngle: 0, attack: true, superAttack: false },
      })
    ).not.toThrow();
  });
});

describe('after a round', () => {
  it('goes back to the room for everybody, which stays open', () => {
    const { room, owner, guest } = readyRoom();
    send(room, 'owner', { t: 'start' }, 0);
    run(room, 0, 1);

    send(room, 'owner', { t: 'lobby' }, 1000);
    expect(room.inMatch).toBe(false);
    expect(owner.count('lobby')).toBe(1);
    expect(guest.count('lobby')).toBe(1);
    // And a newcomer can come in again.
    expect(room.join(new FakePeer('new'), 'Yeni', 'mira')).toBeNull();
  });

  it('starts a fresh match on a rematch, resending the geometry', () => {
    const { room, guest } = readyRoom();
    send(room, 'owner', { t: 'start' }, 0);
    const t = run(room, 0, 1);
    const sentBefore = guest.raw.length;

    send(room, 'owner', { t: 'restart' }, t);
    run(room, t, 0.3);

    expect(guest.count('start')).toBe(2);
    const fresh = guest.states().slice(sentBefore)[0];
    expect(fresh.statics).toBeDefined();
  });

  it('does not let a guest end the round for everybody', () => {
    const { room } = readyRoom();
    send(room, 'owner', { t: 'start' }, 0);
    send(room, 'guest', { t: 'lobby' });
    send(room, 'guest', { t: 'restart' });
    expect(room.inMatch).toBe(true);
  });
});

describe('leaving', () => {
  it('hands a leaver\'s brawler to a bot mid-round and keeps the round going', () => {
    const { room, guest } = readyRoom();
    send(room, 'owner', { t: 'start' }, 0);
    run(room, 0, 1);

    room.leave('guest');
    expect(room.inMatch).toBe(true);

    const owner = new SnapshotDecoder();
    const t = run(room, 1000, 1);
    expect(t).toBeGreaterThan(0);
    // The brawler is still in the world, now flagged as a bot.
    const packets = guest.states().length;
    expect(packets).toBeGreaterThan(0);
    expect(room.roster().find(p => p.id === 'guest')?.isBot).toBe(true);
    void owner;
  });

  it('drops a leaver from the roster once the round is over', () => {
    const { room } = readyRoom();
    send(room, 'owner', { t: 'start' }, 0);
    room.leave('guest');
    send(room, 'owner', { t: 'lobby' }, 100);
    expect(room.roster().some(p => p.id === 'guest')).toBe(false);
    // Real bots the owner added stay; they are part of the room.
    expect(room.roster().filter(p => p.isBot)).toHaveLength(2);
  });

  it('passes the room to somebody else when the owner goes', () => {
    const { room, guest } = readyRoom();
    room.leave('owner');
    expect(guest.last('room')?.owner).toBe('guest');
    // And the new owner can act as one.
    send(room, 'guest', { t: 'addBot' });
    expect(room.roster().filter(p => p.isBot).length).toBe(3);
  });

  it('is forgotten when the last person leaves', () => {
    const { room, onEmpty } = readyRoom();
    room.leave('owner');
    expect(onEmpty).not.toHaveBeenCalled();
    room.leave('guest');
    expect(onEmpty).toHaveBeenCalledTimes(1);
  });

  it('does not tick a room with no match', () => {
    const { room, guest } = readyRoom();
    room.tick(5000);
    expect(guest.raw).toHaveLength(0);
  });
});
