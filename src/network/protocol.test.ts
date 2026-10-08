import { describe, expect, it } from 'vitest';
import {
  generateRoomCode,
  normaliseRoomCode,
  parseClientMessage,
  sanitiseInput,
  sanitiseName,
} from './protocol';

describe('names', () => {
  it('keeps an ordinary name', () => {
    expect(sanitiseName('Yağız')).toBe('Yağız');
  });

  it('strips the characters that make markup', () => {
    const out = sanitiseName('<img src=x onerror=alert(1)>');
    expect(out).not.toMatch(/[<>]/);
    // And it is cut to length after stripping, not before.
    expect(Array.from(out).length).toBeLessThanOrEqual(16);
    expect(sanitiseName('a<b>c')).toBe('abc');
  });

  it('strips control characters', () => {
    expect(sanitiseName('a\u0000b\u001fc\u007f')).toBe('abc');
  });

  it('cuts a long name, counting an emoji as one character', () => {
    expect(Array.from(sanitiseName('x'.repeat(100))).length).toBe(16);
    expect(sanitiseName('🔥'.repeat(40))).toBe('🔥'.repeat(16));
  });

  it('falls back when there is nothing left', () => {
    expect(sanitiseName('   ')).toBe('Brawler');
    expect(sanitiseName('<<<>>>')).toBe('Brawler');
    expect(sanitiseName(undefined)).toBe('Brawler');
    expect(sanitiseName(42)).toBe('Brawler');
  });
});

describe('room codes', () => {
  it('accepts four letters or digits in any case', () => {
    expect(normaliseRoomCode('ab3d')).toBe('AB3D');
    expect(normaliseRoomCode('  KMG2 ')).toBe('KMG2');
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'ABC', 'ABCDE', 'AB D', 'AB-D', 12, null, undefined, {}]) {
      expect(normaliseRoomCode(bad as never)).toBeNull();
    }
  });

  it('generates codes that pass its own check', () => {
    for (let i = 0; i < 200; i++) expect(normaliseRoomCode(generateRoomCode())).not.toBeNull();
  });

  it('never makes a code with look-alike characters', () => {
    for (let i = 0; i < 500; i++) expect(generateRoomCode()).not.toMatch(/[01OI]/);
  });
});

describe('input', () => {
  const clean = { moveX: 0.5, moveY: -1, aimAngle: 1.2, attack: true, superAttack: false };

  it('passes a normal input through', () => {
    expect(sanitiseInput(clean)).toMatchObject(clean);
  });

  it('turns NaN and Infinity into nothing rather than letting them in', () => {
    // A NaN in a position poisons every distance check that touches it, and
    // from there the whole match.
    for (const bad of [NaN, Infinity, -Infinity]) {
      const out = sanitiseInput({ ...clean, moveX: bad, moveY: bad, aimAngle: bad })!;
      expect(out.moveX).toBe(0);
      expect(out.moveY).toBe(0);
      expect(out.aimAngle).toBe(0);
    }
  });

  it('clamps movement to the unit square, so nobody walks faster', () => {
    const out = sanitiseInput({ ...clean, moveX: 9999, moveY: -9999 })!;
    expect(out.moveX).toBe(1);
    expect(out.moveY).toBe(-1);
  });

  it('only believes true to be true', () => {
    const out = sanitiseInput({ ...clean, attack: 'yes', superAttack: 1, gadget: 'true' })!;
    expect(out.attack).toBe(false);
    expect(out.superAttack).toBe(false);
    expect(out.gadget).toBeUndefined();
  });

  it('keeps a super target on the map', () => {
    const out = sanitiseInput({ ...clean, superTargetX: 1e12, superTargetY: -1e12 })!;
    expect(Math.abs(out.superTargetX!)).toBeLessThanOrEqual(10000);
    expect(Math.abs(out.superTargetY!)).toBeLessThanOrEqual(10000);
  });

  it('drops a target that is not a number', () => {
    const out = sanitiseInput({ ...clean, superTargetX: '5', superTargetY: NaN })!;
    expect(out.superTargetX).toBeUndefined();
    expect(out.superTargetY).toBeUndefined();
  });

  it('allows a short emote and nothing longer', () => {
    expect(sanitiseInput({ ...clean, emote: '👑' })!.emote).toBe('👑');
    expect(sanitiseInput({ ...clean, emote: 'x'.repeat(500) })!.emote).toBeUndefined();
    expect(sanitiseInput({ ...clean, emote: { evil: true } })!.emote).toBeUndefined();
  });

  it('does not carry across anything the client attached', () => {
    const out = sanitiseInput({ ...clean, hp: 99999, isAlive: true, __proto__: { x: 1 } }) as unknown as Record<string, unknown>;
    expect(out.hp).toBeUndefined();
    expect(out.isAlive).toBeUndefined();
  });

  it('rejects something that is not an object', () => {
    for (const bad of [null, undefined, 5, 'x', true]) expect(sanitiseInput(bad)).toBeNull();
  });
});

describe('messages', () => {
  it('parses a valid create', () => {
    expect(parseClientMessage({ t: 'create', name: 'Ali', brawler: 'mira', mode: 'showdown' })).toEqual({
      t: 'create',
      name: 'Ali',
      brawler: 'mira',
      mode: 'showdown',
    });
  });

  it('rejects a character that does not exist', () => {
    expect(parseClientMessage({ t: 'create', name: 'A', brawler: 'hacker', mode: 'showdown' })).toBeNull();
    expect(parseClientMessage({ t: 'pick', brawler: '__proto__' })).toBeNull();
  });

  it('rejects a mode that does not exist', () => {
    expect(parseClientMessage({ t: 'mode', mode: 'deathmatch' })).toBeNull();
  });

  it('normalises the code in a join', () => {
    expect(parseClientMessage({ t: 'join', code: ' ab3d ', name: 'A', brawler: 'zirh' })).toMatchObject({
      code: 'AB3D',
    });
    expect(parseClientMessage({ t: 'join', code: 'nop', name: 'A', brawler: 'zirh' })).toBeNull();
    expect(parseClientMessage({ t: 'join', code: 'no pe', name: 'A', brawler: 'zirh' })).toBeNull();
  });

  it('clamps a sequence number into a safe integer', () => {
    const m = parseClientMessage({
      t: 'input',
      seq: 1e30,
      input: { moveX: 0, moveY: 0, aimAngle: 0, attack: false, superAttack: false },
    });
    expect(m && m.t === 'input' && Number.isInteger(m.seq) && m.seq >= 0).toBe(true);
  });

  it('refuses unknown types, and things that are not messages at all', () => {
    for (const bad of [null, undefined, 5, 'start', [], {}, { t: 'rm -rf' }, { t: 'constructor' }]) {
      expect(parseClientMessage(bad as never)).toBeNull();
    }
  });

  it('accepts the argument-less commands', () => {
    for (const t of ['addBot', 'start', 'restart', 'lobby', 'leave'] as const) {
      expect(parseClientMessage({ t })).toEqual({ t });
    }
  });

  it('refuses a ping without a real number', () => {
    expect(parseClientMessage({ t: 'ping', ts: 'now' })).toBeNull();
    expect(parseClientMessage({ t: 'ping', ts: NaN })).toBeNull();
  });
});
