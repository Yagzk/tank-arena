import { describe, expect, it } from 'vitest';
import { pack, unpack } from 'peerjs-js-binarypack';
import canvasSource from '../components/BrawlCanvas.tsx?raw';
import hudSource from '../components/BrawlHUD.tsx?raw';
import modalSource from '../components/StarPlayerModal.tsx?raw';
import interpolationSource from '../net/interpolation.ts?raw';
import kitInfoSource from '../sim/kitInfo.ts?raw';
import { BrawlEngine } from '../game/brawlEngine';
import { FIXED_DT } from '../core/loop';
import { BRAWLER_IDS, type BrawlerEntity, type PlayerInfo } from '../types/brawl';
import {
  BRAWLER_FIELDS,
  BRAWLER_SCALES,
  BRAWLER_SKIPPED,
  SnapshotDecoder,
  SnapshotEncoder,
  decodeBrawler,
  decodeProjectile,
  encodeBrawler,
  encodeProjectile,
} from './codec';

/** What PeerJS actually puts on the wire for a message. */
function wireBytes(message: unknown): number {
  return (pack(message as never) as ArrayBuffer).byteLength;
}

function fullRoom(seed = 5): BrawlEngine {
  const roster: PlayerInfo[] = BRAWLER_IDS.map((brawler, i) => ({
    id: 'p' + i,
    name: 'Oyuncu' + i,
    brawler,
    team: i,
    isHost: i === 0,
    isBot: true,
    score: 0,
    trophies: 0,
  }));
  const engine = new BrawlEngine();
  engine.initMatch(roster, 'showdown', seed);
  engine.phase = 'playing';
  return engine;
}

/** A room a few seconds into a fight, when there is actually state to send. */
function midFight(seconds = 12): BrawlEngine {
  const engine = fullRoom();
  for (let i = 0; i < 60 * seconds; i++) engine.update(FIXED_DT);
  return engine;
}

describe('the brawler codec', () => {
  it('round-trips every brawler in a live fight', () => {
    const engine = midFight();
    for (const b of engine.brawlers) {
      const back = decodeBrawler(encodeBrawler(b));
      for (const key of BRAWLER_FIELDS) {
        const sent = b[key] as unknown;
        const got = back[key] as unknown;
        if (typeof sent === 'number') {
          const scale = BRAWLER_SCALES[key] ?? 1;
          // Half a quantum either way is the most rounding can cost. The
          // "long ago" timers collapse to a sentinel on purpose.
          const longAgo = (key === 'timeSinceLastDamage' || key === 'timeSinceLastAttack') && sent > 5;
          if (longAgo) expect(got, key).toBe(99);
          else expect(Math.abs((got as number) - sent), key).toBeLessThanOrEqual(0.5 / scale + 1e-9);
        } else if (sent === undefined) {
          expect(got === undefined || got === null, key).toBe(true);
        } else {
          expect(got, key).toEqual(sent);
        }
      }
    }
  });

  it('carries a field added to the simulation without being told about it', () => {
    // The field list comes from the entity factory. This is the property that
    // stops a new status effect silently failing to reach the clients.
    const engine = fullRoom();
    const b = engine.brawlers[0];
    expect(BRAWLER_FIELDS).toContain('shieldHp');
    expect(BRAWLER_FIELDS).toContain('passiveCooldowns');
    b.shieldHp = 777;
    expect(decodeBrawler(encodeBrawler(b)).shieldHp).toBe(777);
  });

  it('accounts for every field a live brawler has', () => {
    // Anything on an entity that is neither sent nor deliberately skipped is a
    // field that exists on the host and silently does not on the client.
    const engine = midFight();
    const known = new Set<string>([...BRAWLER_FIELDS, ...BRAWLER_SKIPPED]);
    for (const b of engine.brawlers) {
      for (const key of Object.keys(b)) expect(known.has(key), key).toBe(true);
    }
  });

  it('declares a scale for every fractional field', () => {
    // A float that is not in the table would travel at nine bytes and, worse,
    // would mean the table no longer describes the entity.
    const engine = midFight();
    for (const b of engine.brawlers) {
      for (const key of BRAWLER_FIELDS) {
        const v = b[key] as unknown;
        if (typeof v !== 'number' || Number.isInteger(v)) continue;
        expect(BRAWLER_SCALES[key], key + ' is fractional but has no scale').toBeDefined();
      }
    }
  });

  it('never skips a field the client reads', () => {
    // Read straight from the source rather than trusted: if the renderer or
    // HUD starts using one of the dropped fields, this is what says so.
    const sources = [canvasSource, hudSource, modalSource, interpolationSource, kitInfoSource];
    for (const key of BRAWLER_SKIPPED) {
      for (const text of sources) {
        expect(new RegExp('\\.' + key + '\\b').test(text), key).toBe(false);
      }
    }
  });

  it('puts a fresh brawler on the wire as little more than its identity', () => {
    const engine = fullRoom();
    const sent = encodeBrawler(engine.brawlers[0]);
    // Mask words plus a handful of values: identity, position, health.
    expect(sent.length).toBeLessThan(BRAWLER_FIELDS.length / 2);
  });

  it('gives every decoded brawler its own cooldown record', () => {
    const a = decodeBrawler(encodeBrawler(fullRoom().brawlers[0]));
    const b = decodeBrawler(encodeBrawler(fullRoom().brawlers[1]));
    a.passiveCooldowns['x'] = 1;
    expect(b.passiveCooldowns['x']).toBeUndefined();
  });
});

describe('projectiles', () => {
  it('keeps the id the interpolator matches on', () => {
    const engine = fullRoom();
    engine.projectiles.push({
      id: 'proj-4242',
      ownerId: 'p0',
      brawlerId: 'mira',
      team: 0,
      x: 123.456,
      y: 789.012,
      vx: 300.4,
      vy: -120.6,
      radius: 5.5,
      damage: 100,
      maxRange: 300,
      traveled: 10,
      isSuper: true,
      color: '#c084fc',
      piercesWalls: false,
      breaksWalls: false,
    });
    const back = decodeProjectile(encodeProjectile(engine.projectiles[0]));
    expect(back.id).toBe('proj-4242');
    expect(back.x).toBeCloseTo(123.5, 1);
    expect(back.isSuper).toBe(true);
    expect(back.color).toBe('#c084fc');
  });
});

describe('the packet', () => {
  it('sends geometry on the first packet and then leaves it out', () => {
    const engine = midFight();
    const encoder = new SnapshotEncoder();
    expect(encoder.encode(engine.getSnapshot(), 0).statics).toBeDefined();
    expect(encoder.encode(engine.getSnapshot(), 33).statics).toBeUndefined();
    expect(encoder.encode(engine.getSnapshot(), 66).statics).toBeUndefined();
  });

  it('sends geometry again when a wall is destroyed', () => {
    const engine = midFight();
    const encoder = new SnapshotEncoder();
    encoder.encode(engine.getSnapshot(), 0);

    const index = engine.walls.findIndex(w => w.isDestructible);
    expect(index).toBeGreaterThanOrEqual(0);
    engine.walls.splice(index, 1);

    const next = encoder.encode(engine.getSnapshot(), 33);
    expect(next.statics?.walls.length).toBe(engine.walls.length);
  });

  it('repeats geometry on a slow keyframe, as insurance', () => {
    const engine = midFight();
    const encoder = new SnapshotEncoder();
    encoder.encode(engine.getSnapshot(), 0);
    expect(encoder.encode(engine.getSnapshot(), 1000).statics).toBeUndefined();
    expect(encoder.encode(engine.getSnapshot(), 3500).statics).toBeDefined();
  });

  it('resends geometry after a reset, which is what a new match needs', () => {
    const engine = midFight();
    const encoder = new SnapshotEncoder();
    encoder.encode(engine.getSnapshot(), 0);
    encoder.reset();
    expect(encoder.encode(engine.getSnapshot(), 33).statics).toBeDefined();
  });

  it('lets a client rebuild the whole world from the stream', () => {
    const engine = midFight();
    const encoder = new SnapshotEncoder();
    const decoder = new SnapshotDecoder();
    const source = engine.getSnapshot();

    // The first packet carries geometry; the client must keep it for the next.
    decoder.decode(encoder.encode(source, 0));
    const second = decoder.decode(encoder.encode(source, 33));

    expect(second.walls).toHaveLength(source.walls.length);
    expect(second.bushes).toHaveLength(source.bushes.length);
    expect(second.brawlers.map(b => b.id)).toEqual(source.brawlers.map(b => b.id));
    expect(second.phase).toBe(source.phase);
    expect(second.mapName).toBe(source.mapName);
    for (let i = 0; i < source.brawlers.length; i++) {
      expect(second.brawlers[i].x).toBeCloseTo(source.brawlers[i].x, 0);
      expect(Math.abs(second.brawlers[i].hp - source.brawlers[i].hp)).toBeLessThanOrEqual(0.5);
    }
  });

  it('survives the real serializer', () => {
    const engine = midFight();
    const encoder = new SnapshotEncoder();
    const decoder = new SnapshotDecoder();
    const net = encoder.encode(engine.getSnapshot(), 0);

    // Through the same pack/unpack PeerJS uses, not just through memory.
    const wire = unpack(pack(net as never) as ArrayBuffer) as unknown as typeof net;
    const back = decoder.decode(wire);
    expect(back.brawlers).toHaveLength(engine.brawlers.length);
    expect(back.brawlers[0].name).toBe(engine.brawlers[0].name);
    expect(back.brawlers[0].passiveCooldowns).toBeDefined();
  });
});

describe('size on the wire', () => {
  it('is a fraction of what the full snapshot cost', () => {
    const engine = midFight();
    const snap = engine.getSnapshot();
    const encoder = new SnapshotEncoder();
    encoder.encode(snap, 0); // the keyframe, paid once

    const before = wireBytes({ type: 'STATE', snapshot: snap });
    const after = wireBytes({ type: 'STATE', snapshot: encoder.encode(snap, 33) });

    console.log('wire bytes per packet: before', before, 'after', after, '(' + Math.round((after / before) * 100) + '%)');
    expect(after).toBeLessThan(before * 0.3);
  });

  it('fits ten players in a few kilobytes', () => {
    const engine = midFight();
    const encoder = new SnapshotEncoder();
    encoder.encode(engine.getSnapshot(), 0);
    const bytes = wireBytes({ type: 'STATE', snapshot: encoder.encode(engine.getSnapshot(), 33) });
    expect(bytes).toBeLessThan(6000);
  });

  it('stays small while a lot is happening', () => {
    // Quiet moments flatter any format. This is the packet that matters: bots
    // fighting, projectiles in the air, effects playing.
    const engine = fullRoom(9);
    const encoder = new SnapshotEncoder();
    let worst = 0;
    for (let tick = 0; tick < 60 * 40; tick++) {
      engine.update(FIXED_DT);
      if (tick % 20 !== 0) continue;
      const net = encoder.encode(engine.getSnapshot(), tick * 16);
      // A keyframe carries the geometry and is sent on a slow timer; it is
      // allowed to be larger, so measure the packets between them.
      if (net.statics) continue;
      worst = Math.max(worst, wireBytes({ type: 'STATE', snapshot: net }));
    }
    console.log('worst non-keyframe packet over a 40 s fight:', worst, 'bytes');
    expect(worst).toBeLessThan(6000);
  });
});
