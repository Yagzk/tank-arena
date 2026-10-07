import { describe, expect, it } from 'vitest';
import {
  GRID_H,
  GRID_W,
  MAP_POOL,
  TILE,
  TILES,
  buildMap,
  expandMap,
  mapsFor,
  pickMap,
  validateMap,
  type TileMapSource,
} from './index';

function countTiles(rows: string[], ch: string): number {
  return rows.reduce((total, row) => total + row.split(ch).length - 1, 0);
}

describe('the pool', () => {
  it('validates every map', () => {
    // The same check runs at load, so a broken map never reaches a match.
    // This test is what tells you which one, and why.
    for (const map of MAP_POOL) {
      expect(validateMap(map), map.id).toEqual([]);
    }
  });

  it('expands every map to the full grid', () => {
    for (const map of MAP_POOL) {
      const grid = expandMap(map);
      expect(grid, map.id).toHaveLength(GRID_H);
      for (const row of grid) expect(row.length, map.id).toBe(GRID_W);
    }
  });

  it('has several maps for each mode', () => {
    expect(mapsFor('gem_grab').length).toBeGreaterThanOrEqual(4);
    expect(mapsFor('showdown').length).toBeGreaterThanOrEqual(4);
  });

  it('gives every map a distinct id and a name', () => {
    const ids = new Set(MAP_POOL.map(m => m.id));
    expect(ids.size).toBe(MAP_POOL.length);
    for (const map of MAP_POOL) expect(map.name.length, map.id).toBeGreaterThan(2);
  });
});

describe('symmetry', () => {
  it('mirrors a half and swaps which side the spawns belong to', () => {
    const source: TileMapSource = {
      id: 't',
      name: 'T',
      modes: ['gem_grab'],
      symmetry: 'mirror',
      rows: ['#1.#'],
    };
    // Reading right to left: '#', '.', '1' → '2', '#'.
    expect(expandMap(source)).toEqual(['#1.##.2#']);
  });

  it('mirrors a quarter both ways', () => {
    const source: TileMapSource = {
      id: 't',
      name: 'T',
      modes: ['showdown'],
      symmetry: 'quadrant',
      rows: ['#.', 'o.'],
    };
    expect(expandMap(source)).toEqual(['#..#', 'o..o', 'o..o', '#..#']);
  });

  it('gives both teams the same cover, by construction', () => {
    // Nothing in a mirrored map can differ between the sides, so this is a
    // property of the format rather than of any particular map — which is
    // exactly why maps are authored as halves.
    for (const map of MAP_POOL.filter(m => m.symmetry === 'mirror')) {
      const grid = expandMap(map);
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W / 2; x++) {
          const left = grid[y][x];
          const right = grid[y][GRID_W - 1 - x];
          const expected =
            left === TILES.SPAWN_A ? TILES.SPAWN_B : left === TILES.SPAWN_B ? TILES.SPAWN_A : left;
          expect(right, map.id + ' at ' + x + ',' + y).toBe(expected);
        }
      }
    }
  });
});

describe('the validator', () => {
  const sound = (over: Partial<TileMapSource> = {}): TileMapSource => ({
    id: 'probe',
    name: 'PROBE',
    modes: ['showdown'],
    symmetry: 'quadrant',
    rows: [
      '####################',
      '#..s....####........',
      '#.......####..****..',
      '#..****.......****..',
      '#..****.s.....****..',
      '#..****..xxxx.......',
      '#........xxxx..##...',
      '#..............##...',
      '#....****...........',
      '#....****......s....',
      '#....****..####.....',
      '#..........####.....',
      '#......****.........',
      '#......****..****...',
      '#............****...',
    ],
    ...over,
  });

  it('accepts a sound map', () => {
    expect(validateMap(sound())).toEqual([]);
  });

  it('rejects the wrong number of rows', () => {
    expect(validateMap(sound({ rows: ['####'] })).join()).toMatch(/expected 15/);
  });

  it('rejects a ragged row', () => {
    const rows = sound().rows.slice();
    rows[3] = '#..';
    expect(validateMap(sound({ rows })).join()).toMatch(/wide, expected 20/);
  });

  it('rejects a tile that is not in the legend', () => {
    const rows = sound().rows.slice();
    rows[3] = '#..Q................';
    expect(validateMap(sound({ rows })).join()).toMatch(/unknown tile "Q"/);
  });

  it('rejects an open border', () => {
    const rows = sound().rows.slice();
    rows[0] = '#...................';
    expect(validateMap(sound({ rows })).join()).toMatch(/border is open/);
  });

  it('rejects a base nobody can walk out of', () => {
    // The worst map bug there is, because it only shows up with a human being
    // sitting in the sealed room.
    const rows = sound().rows.slice();
    rows[1] = '#..s##..............';
    rows[2] = '#####...............';
    expect(validateMap(sound({ rows })).join()).toMatch(/walled off/);
  });

  it('rejects an arena with almost no cover', () => {
    // The whole first draft of the pool failed this, and it was right to:
    // an open field plays as one long sightline, so whoever shoots furthest
    // wins and nothing else in the game matters.
    const rows = Array.from({ length: 15 }, (_, y) =>
      y === 0 ? '#'.repeat(20) : '#' + '.'.repeat(19)
    );
    rows[1] = '#..s................';
    rows[4] = '#.......s...........';
    rows[9] = '#..............s....';
    expect(validateMap(sound({ rows })).join()).toMatch(/too open/);
  });

  it('rejects an arena with nowhere to move unseen', () => {
    const rows = sound().rows.map(row => row.split('*').join('#'));
    expect(validateMap(sound({ rows })).join()).toMatch(/no way to move unseen/);
  });

  it('rejects a Showdown map with too few spawns', () => {
    const rows = sound().rows.slice();
    rows[4] = '#...................';
    rows[9] = '#...................';
    expect(validateMap(sound({ rows })).join()).toMatch(/ten spawns/);
  });

  it('rejects a team map with no objective', () => {
    const rows = [
      '####################',
      ...Array.from({ length: 28 }, () => '#...................'),
      '####################',
    ];
    rows[10] = '#1..................';
    rows[11] = '#1..................';
    rows[12] = '#1..................';
    rows[13] = '#1..................';
    rows[14] = '#1..................';
    const map: TileMapSource = {
      id: 'probe2',
      name: 'P',
      modes: ['gem_grab'],
      symmetry: 'mirror',
      rows,
    };
    expect(validateMap(map).join()).toMatch(/needs an objective/);
  });
});

describe('building geometry', () => {
  it('merges a run of wall tiles into one rectangle', () => {
    // One rectangle per tile would mean a body standing against a long wall
    // is pushed out of it once per tile, in the same step.
    const source: TileMapSource = {
      id: 't',
      name: 'T',
      modes: ['showdown'],
      symmetry: 'full',
      rows: Array.from({ length: GRID_H }, (_, y) =>
        y === 5 ? '#'.repeat(10) + '.'.repeat(GRID_W - 10) : '#' + '.'.repeat(GRID_W - 2) + '#'
      ),
    };
    const built = buildMap(source, 'showdown');
    const longRun = built.walls.find(w => w.y === 5 * TILE && w.w === 10 * TILE);
    expect(longRun).toBeDefined();
  });

  it('marks crates destructible and plain walls not', () => {
    const map = MAP_POOL.find(m => m.id === 'tas-ocagi')!;
    const built = buildMap(map, 'gem_grab');
    expect(built.walls.some(w => w.isDestructible)).toBe(true);
    expect(built.walls.some(w => !w.isDestructible)).toBe(true);
  });

  it('resolves a pair of mirrored objective tiles to one centred mine', () => {
    const built = buildMap(MAP_POOL.find(m => m.id === 'sert-kaya')!, 'gem_grab');
    expect(built.gemMine).toBeDefined();
    expect(built.gemMine!.x).toBeCloseTo((GRID_W * TILE) / 2, 5);
    expect(built.gemMine!.y).toBeCloseTo((GRID_H * TILE) / 2, 5);
  });

  it('groups team spawns so the first half is one side', () => {
    const built = buildMap(MAP_POOL.find(m => m.id === 'sert-kaya')!, 'gem_grab');
    const half = built.spawns.length / 2;
    expect(built.spawns.slice(0, half).every(s => s.team === 0)).toBe(true);
    expect(built.spawns.slice(half).every(s => s.team === 1)).toBe(true);
  });

  it('gives a Showdown map a spawn for every player', () => {
    for (const map of mapsFor('showdown')) {
      const built = buildMap(map, 'showdown');
      expect(built.spawns.length, map.id).toBeGreaterThanOrEqual(10);
    }
  });

  it('drops power cube boxes where the map asked for them', () => {
    const map = MAP_POOL.find(m => m.id === 'hurdalik')!;
    const built = buildMap(map, 'showdown');
    expect(built.boxes.length).toBe(countTiles(expandMap(map), TILES.BOX));
    expect(built.boxes.length).toBeGreaterThan(4);
  });
});

describe('choosing a map', () => {
  it('picks the same map for the same seed', () => {
    expect(pickMap('gem_grab', 1234).id).toBe(pickMap('gem_grab', 1234).id);
  });

  it('picks only maps that support the mode', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(pickMap('showdown', seed).modes).toContain('showdown');
      expect(pickMap('gem_grab', seed).modes).toContain('gem_grab');
    }
  });

  it('rotates across the pool rather than settling on one', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) seen.add(pickMap('showdown', seed).id);
    expect(seen.size).toBe(mapsFor('showdown').length);
  });
});
