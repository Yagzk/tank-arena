/**
 * Maps as data.
 *
 * There was one hand-coded map per mode, written as a hundred lines of
 * `walls.push({ x: cx - 180, y: cy - 140, w: 90, h: 40 })`. You could not look
 * at that and see the map, which means you could not look at it and see that
 * one team's cover was better than the other's — and in a symmetrical game
 * that is the only property that really matters.
 *
 * A map is now a grid of characters. You can read it, and the parts that are
 * easy to get wrong are checked rather than trusted: symmetry is guaranteed by
 * construction, because a map is authored as a half or a quarter and the rest
 * is generated, and connectivity is verified, because a base nobody can walk
 * out of is a map nobody can play.
 */

import { MODES } from '../game/modes';
import type {
  GoalArea,
  BrawlGameMode,
  BrawlWall,
  Bush,
  GemMine,
  PowerCubeBox,
} from '../types/brawl';

/** Side of one tile, in world units. A brawler is 44 across. */
export const TILE = 60;

/** Grid dimensions. Every map in the pool is this size. */
export const GRID_W = 40;
export const GRID_H = 30;

export const MAP_WIDTH = GRID_W * TILE;
export const MAP_HEIGHT = GRID_H * TILE;

/**
 * The legend.
 *
 * Deliberately pictorial: `#` reads as solid, `*` as foliage, `~` as water.
 * A map you have to decode is a map nobody will edit.
 */
export const TILES = {
  OPEN: '.',
  /** Permanent cover. */
  WALL: '#',
  /** Breakable cover. Shapes a fight early, opens the map up late. */
  CRATE: 'x',
  /** Blocks sight, not movement. */
  BUSH: '*',
  /** Blocks movement, not sight. */
  WATER: '~',
  /** Power cube box. */
  BOX: 'o',
  /** Objective: the gem mine, and later the safe, the zone. */
  OBJECTIVE: 'G',
  /** Team 0 spawn. Mirrors into a team 1 spawn. */
  SPAWN_A: '1',
  /** Team 1 spawn. */
  SPAWN_B: '2',
  /** Free-for-all spawn. */
  SPAWN_FFA: 's',
  /** Ground that is team A's goal. Mirrors into team B's. */
  GOAL_A: 'a',
  /** Ground that is team B's goal. */
  GOAL_B: 'b',
  /** Where the ball starts. */
  BALL: '=',
} as const;

const BLOCKING: ReadonlySet<string> = new Set<string>([
  TILES.WALL,
  TILES.CRATE,
  TILES.WATER,
  TILES.BOX,
]);

export type Symmetry =
  /** Rows are the LEFT half; the right half is its mirror, teams swapped. */
  | 'mirror'
  /** Rows are the TOP-LEFT quarter, mirrored both ways. */
  | 'quadrant'
  /** Rows are the whole grid, and symmetry is only checked, not imposed. */
  | 'full';

export interface TileMapSource {
  id: string;
  /** Shown on the loading screen and in the map pool. */
  name: string;
  modes: BrawlGameMode[];
  symmetry: Symmetry;
  rows: string[];
}

export interface SpawnPoint {
  x: number;
  y: number;
  team: number;
}

export interface MapData {
  walls: BrawlWall[];
  bushes: Bush[];
  boxes: PowerCubeBox[];
  gemMine?: GemMine;
  /** The map's objective point, if it has one — the mine, or the zone. */
  objective?: { x: number; y: number };
  /** Brawl Ball: where the ball starts, and the two goal mouths. */
  ballSpawn?: { x: number; y: number };
  goals: GoalArea[];
  spawns: SpawnPoint[];
  /** The map this came from, for the HUD. */
  name: string;
}

/** Mirroring a half swaps which side of the map a spawn belongs to. */
function mirrorTile(ch: string): string {
  if (ch === TILES.SPAWN_A) return TILES.SPAWN_B;
  if (ch === TILES.SPAWN_B) return TILES.SPAWN_A;
  if (ch === TILES.GOAL_A) return TILES.GOAL_B;
  if (ch === TILES.GOAL_B) return TILES.GOAL_A;
  return ch;
}

/**
 * Turns an authored half or quarter into the full grid.
 *
 * This is where symmetry comes from. Authoring a whole map and then checking
 * it for symmetry gets the job done eventually; generating the other half
 * means it cannot be wrong in the first place, and halves the work.
 */
export function expandMap(source: TileMapSource): string[] {
  const { rows, symmetry } = source;

  if (symmetry === 'full') return rows.slice();

  if (symmetry === 'mirror') {
    return rows.map(row => {
      let mirrored = '';
      for (let i = row.length - 1; i >= 0; i--) mirrored += mirrorTile(row[i]);
      return row + mirrored;
    });
  }

  // Quadrant: mirror across the vertical axis, then across the horizontal one.
  const widened = rows.map(row => {
    let mirrored = '';
    for (let i = row.length - 1; i >= 0; i--) mirrored += mirrorTile(row[i]);
    return row + mirrored;
  });
  return widened.concat(widened.slice().reverse());
}

/** Flood fills the open tiles reachable from one point. */
function reachable(grid: string[], startX: number, startY: number): Set<number> {
  const seen = new Set<number>();
  const queue: number[] = [startY * GRID_W + startX];
  seen.add(queue[0]);

  while (queue.length > 0) {
    const index = queue.pop()!;
    const x = index % GRID_W;
    const y = (index - x) / GRID_W;

    // Four-way: a diagonal gap between two walls is not a corridor a body
    // 44 units across can actually squeeze through.
    const steps = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of steps) {
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      const next = ny * GRID_W + nx;
      if (seen.has(next)) continue;
      if (BLOCKING.has(grid[ny][nx])) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

/**
 * Everything that can be checked about a map before anybody has to play it.
 *
 * Returns the problems found; an empty list means it is sound.
 */
export function validateMap(source: TileMapSource): string[] {
  const problems: string[] = [];
  const at = (msg: string) => problems.push(source.id + ': ' + msg);

  const expected =
    source.symmetry === 'full'
      ? { w: GRID_W, h: GRID_H }
      : source.symmetry === 'mirror'
        ? { w: GRID_W / 2, h: GRID_H }
        : { w: GRID_W / 2, h: GRID_H / 2 };

  if (source.rows.length !== expected.h) {
    at('has ' + source.rows.length + ' rows, expected ' + expected.h);
    return problems;
  }
  source.rows.forEach((row, y) => {
    if (row.length !== expected.w) {
      at('row ' + y + ' is ' + row.length + ' wide, expected ' + expected.w);
    }
  });
  if (problems.length > 0) return problems;

  const legend = new Set<string>(Object.values(TILES));
  source.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!legend.has(row[x])) {
        at('unknown tile "' + row[x] + '" at ' + x + ',' + y);
      }
    }
  });
  if (problems.length > 0) return problems;

  const grid = expandMap(source);

  // The border has to be solid, or a brawler walks off the edge of the world.
  for (let x = 0; x < GRID_W; x++) {
    if (!BLOCKING.has(grid[0][x]) || !BLOCKING.has(grid[GRID_H - 1][x])) {
      at('the top or bottom border is open at column ' + x);
      break;
    }
  }
  for (let y = 0; y < GRID_H; y++) {
    if (!BLOCKING.has(grid[y][0]) || !BLOCKING.has(grid[y][GRID_W - 1])) {
      at('the left or right border is open at row ' + y);
      break;
    }
  }

  // Spawns.
  const spawns: Array<{ x: number; y: number; ch: string }> = [];
  let objectives = 0;
  let balls = 0;
  let goalsA = 0;
  let goalsB = 0;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const ch = grid[y][x];
      if (ch === TILES.SPAWN_A || ch === TILES.SPAWN_B || ch === TILES.SPAWN_FFA) {
        spawns.push({ x, y, ch });
      }
      if (ch === TILES.OBJECTIVE) objectives++;
      if (ch === TILES.BALL) balls++;
      if (ch === TILES.GOAL_A) goalsA++;
      if (ch === TILES.GOAL_B) goalsB++;
    }
  }

  const teamModes = source.modes.filter(m => MODES[m].mapKind === 'sides');
  const ffaModes = source.modes.filter(m => MODES[m].mapKind === 'arena');

  if (ffaModes.length > 0) {
    const ffa = spawns.filter(s => s.ch === TILES.SPAWN_FFA);
    if (ffa.length < 10) {
      at('a Showdown map needs ten spawns, found ' + ffa.length);
    }
  }
  if (teamModes.length > 0) {
    const a = spawns.filter(s => s.ch === TILES.SPAWN_A).length;
    const b = spawns.filter(s => s.ch === TILES.SPAWN_B).length;
    if (a < 5 || b < 5) at('a team map needs five spawns a side, found ' + a + ' and ' + b);
    if (a !== b) at('the teams have different numbers of spawns: ' + a + ' and ' + b);
    // A ball map's centre is the ball, not an objective tile.
    if (objectives === 0 && teamModes.some(m => !MODES[m].usesBall)) {
      at('a team map needs an objective tile');
    }
  }

  // A map that offers a ball game has to have the parts of one, and the same
  // amount of goal for each side or one team's net is bigger than the other's.
  if (source.modes.some(m => MODES[m].usesBall)) {
    if (balls === 0) at('a ball map needs a ball tile');
    if (goalsA === 0 || goalsB === 0) at('a ball map needs a goal for each team');
    if (goalsA !== goalsB) at('the goals differ in size: ' + goalsA + ' and ' + goalsB);
  }

  // Cover density.
  //
  // An arena that is mostly open ground plays as one long sightline: there is
  // nowhere to approach from, so whoever shoots furthest wins and nothing else
  // in the game matters. Too dense and nobody can find anybody. The border is
  // excluded because it is the same on every map and would flatter all of them
  // equally.
  let interior = 0;
  let cover = 0;
  let bush = 0;
  for (let y = 1; y < GRID_H - 1; y++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      interior++;
      const ch = grid[y][x];
      if (ch === TILES.BUSH) bush++;
      if (ch === TILES.BUSH || BLOCKING.has(ch)) cover++;
    }
  }
  const coverPct = cover / interior;
  const bushPct = bush / interior;
  if (coverPct < 0.26) {
    at('only ' + Math.round(coverPct * 100) + '% cover — too open to approach anyone');
  }
  if (coverPct > 0.5) {
    at(Math.round(coverPct * 100) + '% cover — nobody will find anybody');
  }
  if (bushPct < 0.07) {
    at('only ' + Math.round(bushPct * 100) + '% bush — no way to move unseen');
  }

  // Connectivity. Crates and boxes count as blocking, so a route out of the
  // base is a route that exists without breaking anything first.
  if (spawns.length > 0) {
    const first = spawns[0];
    const region = reachable(grid, first.x, first.y);
    for (const spawn of spawns) {
      if (!region.has(spawn.y * GRID_W + spawn.x)) {
        at('the spawn at ' + spawn.x + ',' + spawn.y + ' is walled off from the rest');
        break;
      }
    }
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (grid[y][x] !== TILES.OBJECTIVE) continue;
        if (!region.has(y * GRID_W + x)) {
          at('the objective at ' + x + ',' + y + ' cannot be reached');
        }
      }
    }
  }

  return problems;
}

/**
 * Merges a row of identical tiles into one rectangle.
 *
 * A wall per tile would mean three hundred rectangles where thirty will do.
 * The broadphase could cope, but the collision resolver pushes a body out of
 * every rectangle it overlaps, and a body standing against a run of ten tiles
 * would be pushed ten times in one step.
 */
function runsOf(grid: string[], match: (ch: string) => boolean): Array<{
  x: number;
  y: number;
  w: number;
  h: number;
  ch: string;
}> {
  const out: Array<{ x: number; y: number; w: number; h: number; ch: string }> = [];

  for (let y = 0; y < GRID_H; y++) {
    let runStart = -1;
    let runChar = '';
    for (let x = 0; x <= GRID_W; x++) {
      const ch = x < GRID_W ? grid[y][x] : '';
      const matches = x < GRID_W && match(ch) && (runStart === -1 || ch === runChar);
      if (matches && runStart === -1) {
        runStart = x;
        runChar = ch;
      } else if (!matches && runStart !== -1) {
        out.push({
          x: runStart * TILE,
          y: y * TILE,
          w: (x - runStart) * TILE,
          h: TILE,
          ch: runChar,
        });
        runStart = -1;
        // A different tile that still matches starts a new run immediately.
        if (x < GRID_W && match(ch)) {
          runStart = x;
          runChar = ch;
        }
      }
    }
  }
  return out;
}

/** Turns a validated map source into the geometry the engine runs on. */
export function buildMap(source: TileMapSource, mode: BrawlGameMode): MapData {
  const grid = expandMap(source);
  const arena = MODES[mode].mapKind === 'arena';

  const walls: BrawlWall[] = [];
  const bushes: Bush[] = [];
  const boxes: PowerCubeBox[] = [];
  const spawns: SpawnPoint[] = [];
  let objectiveX = 0;
  let objectiveY = 0;
  let objectiveCount = 0;
  let ballX = 0;
  let ballY = 0;
  let ballCount = 0;
  const goalBounds: Array<{ minX: number; minY: number; maxX: number; maxY: number } | null> = [null, null];

  runsOf(grid, ch => ch === TILES.WALL || ch === TILES.CRATE || ch === TILES.WATER).forEach(
    (run, i) => {
      walls.push({
        id: 'w' + i,
        x: run.x,
        y: run.y,
        w: run.w,
        h: run.h,
        isDestructible: run.ch === TILES.CRATE,
        isWater: run.ch === TILES.WATER || undefined,
      });
    }
  );

  runsOf(grid, ch => ch === TILES.BUSH).forEach((run, i) => {
    bushes.push({ id: 'bu' + i, x: run.x, y: run.y, w: run.w, h: run.h });
  });

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const ch = grid[y][x];
      const wx = x * TILE + TILE / 2;
      const wy = y * TILE + TILE / 2;

      if (ch === TILES.BOX) {
        boxes.push({
          id: 'bx' + boxes.length,
          x: wx - 24,
          y: wy - 24,
          w: 48,
          h: 48,
          hp: 4500,
          maxHp: 4500,
        });
      } else if (ch === TILES.BALL) {
        ballX += wx;
        ballY += wy;
        ballCount++;
      } else if (ch === TILES.GOAL_A || ch === TILES.GOAL_B) {
        const team = ch === TILES.GOAL_A ? 0 : 1;
        const b = goalBounds[team];
        const left = x * TILE;
        const top = y * TILE;
        goalBounds[team] = b
          ? {
              minX: Math.min(b.minX, left),
              minY: Math.min(b.minY, top),
              maxX: Math.max(b.maxX, left + TILE),
              maxY: Math.max(b.maxY, top + TILE),
            }
          : { minX: left, minY: top, maxX: left + TILE, maxY: top + TILE };
      } else if (ch === TILES.OBJECTIVE) {
        objectiveX += wx;
        objectiveY += wy;
        objectiveCount++;
      } else if (ch === TILES.SPAWN_FFA && arena) {
        spawns.push({ x: wx, y: wy, team: spawns.length });
      } else if (ch === TILES.SPAWN_A && !arena) {
        spawns.push({ x: wx, y: wy, team: 0 });
      } else if (ch === TILES.SPAWN_B && !arena) {
        spawns.push({ x: wx, y: wy, team: 1 });
      }
    }
  }

  // Team spawns come out of the grid in reading order, which interleaves the
  // sides. The engine indexes the first half as team 0, so sort them back.
  if (!arena) spawns.sort((a, b) => a.team - b.team);

  const goals: GoalArea[] = [];
  goalBounds.forEach((b, team) => {
    if (b) goals.push({ team, x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY });
  });

  const data: MapData = { walls, bushes, boxes, spawns, name: source.name, goals };
  if (ballCount > 0) data.ballSpawn = { x: ballX / ballCount, y: ballY / ballCount };

  // Wherever the map puts its objective, for the modes that have one. Averaged,
  // so a pair of mirrored tiles either side of the axis resolves to the exact
  // centre line rather than to two points.
  if (objectiveCount > 0) {
    data.objective = { x: objectiveX / objectiveCount, y: objectiveY / objectiveCount };
  }

  if (mode === 'gem_grab' && objectiveCount > 0) {
    // Averaged, so a pair of mirrored tiles either side of the axis resolves
    // to the exact centre line rather than to two mines.
    data.gemMine = {
      x: objectiveX / objectiveCount,
      y: objectiveY / objectiveCount,
      spawnTimer: 4.5,
      totalSpawned: 0,
    };
  }

  return data;
}
