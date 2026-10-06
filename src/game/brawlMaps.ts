import { BrawlWall, Bush, PowerCubeBox, GemMine, BrawlGameMode } from '../types/brawl';

export const MAP_WIDTH = 2400;
export const MAP_HEIGHT = 1800;
export const BORDER_THICKNESS = 40;

export interface SpawnPoint {
  x: number;
  y: number;
  team: number;
}

// 10 Spawn points around the large arena
export const SHOWDOWN_SPAWNS: SpawnPoint[] = [
  { x: 260, y: 260, team: 0 },
  { x: MAP_WIDTH - 260, y: 260, team: 1 },
  { x: MAP_WIDTH - 260, y: MAP_HEIGHT - 260, team: 2 },
  { x: 260, y: MAP_HEIGHT - 260, team: 3 },
  { x: MAP_WIDTH / 2, y: 220, team: 4 },
  { x: MAP_WIDTH / 2, y: MAP_HEIGHT - 220, team: 5 },
  { x: 220, y: MAP_HEIGHT / 2, team: 6 },
  { x: MAP_WIDTH - 220, y: MAP_HEIGHT / 2, team: 7 },
  { x: 500, y: 500, team: 8 },
  { x: MAP_WIDTH - 500, y: MAP_HEIGHT - 500, team: 9 },
];

export const GEM_GRAB_SPAWNS: SpawnPoint[] = [
  // Team 0 (Blue Team - Left Base)
  { x: 250, y: MAP_HEIGHT / 2 - 180, team: 0 },
  { x: 250, y: MAP_HEIGHT / 2 - 60, team: 0 },
  { x: 250, y: MAP_HEIGHT / 2 + 60, team: 0 },
  { x: 250, y: MAP_HEIGHT / 2 + 180, team: 0 },
  { x: 380, y: MAP_HEIGHT / 2, team: 0 },

  // Team 1 (Red Team - Right Base)
  { x: MAP_WIDTH - 250, y: MAP_HEIGHT / 2 - 180, team: 1 },
  { x: MAP_WIDTH - 250, y: MAP_HEIGHT / 2 - 60, team: 1 },
  { x: MAP_WIDTH - 250, y: MAP_HEIGHT / 2 + 60, team: 1 },
  { x: MAP_WIDTH - 250, y: MAP_HEIGHT / 2 + 180, team: 1 },
  { x: MAP_WIDTH - 380, y: MAP_HEIGHT / 2, team: 1 },
];

export interface MapData {
  walls: BrawlWall[];
  bushes: Bush[];
  boxes: PowerCubeBox[];
  gemMine?: GemMine;
  spawns: SpawnPoint[];
}

export function generateBrawlMap(mode: BrawlGameMode): MapData {
  const walls: BrawlWall[] = [];
  const bushes: Bush[] = [];
  const boxes: PowerCubeBox[] = [];

  // 1. Outer Border Walls (Indestructible)
  walls.push({ id: 'b-top', x: 0, y: 0, w: MAP_WIDTH, h: BORDER_THICKNESS, isDestructible: false });
  walls.push({ id: 'b-bot', x: 0, y: MAP_HEIGHT - BORDER_THICKNESS, w: MAP_WIDTH, h: BORDER_THICKNESS, isDestructible: false });
  walls.push({ id: 'b-left', x: 0, y: 0, w: BORDER_THICKNESS, h: MAP_HEIGHT, isDestructible: false });
  walls.push({ id: 'b-right', x: MAP_WIDTH - BORDER_THICKNESS, y: 0, w: BORDER_THICKNESS, h: MAP_HEIGHT, isDestructible: false });

  if (mode === 'showdown') {
    // ================= SOLO / DUO SHOWDOWN MAP =================
    // Central Fortress & Lake
    const cx = MAP_WIDTH / 2;
    const cy = MAP_HEIGHT / 2;

    // Center breakable ruins & pillars
    walls.push({ id: 'w-c1', x: cx - 180, y: cy - 140, w: 90, h: 40, isDestructible: true });
    walls.push({ id: 'w-c2', x: cx + 90, y: cy - 140, w: 90, h: 40, isDestructible: true });
    walls.push({ id: 'w-c3', x: cx - 180, y: cy + 100, w: 90, h: 40, isDestructible: true });
    walls.push({ id: 'w-c4', x: cx + 90, y: cy + 100, w: 90, h: 40, isDestructible: true });

    // Solid central pillars
    walls.push({ id: 'w-p1', x: cx - 140, y: cy - 60, w: 40, h: 120, isDestructible: false });
    walls.push({ id: 'w-p2', x: cx + 100, y: cy - 60, w: 40, h: 120, isDestructible: false });

    // Quadrant Barriers & Ruins
    const quads = [
      { x: 550, y: 450 },
      { x: MAP_WIDTH - 650, y: 450 },
      { x: 550, y: MAP_HEIGHT - 550 },
      { x: MAP_WIDTH - 650, y: MAP_HEIGHT - 550 },
    ];

    quads.forEach((q, idx) => {
      walls.push({ id: `w-q-${idx}-1`, x: q.x, y: q.y, w: 120, h: 35, isDestructible: false });
      walls.push({ id: `w-q-${idx}-2`, x: q.x, y: q.y + 35, w: 35, h: 100, isDestructible: false });
      walls.push({ id: `w-q-${idx}-3`, x: q.x + 85, y: q.y + 35, w: 35, h: 100, isDestructible: true });
    });

    // Outer Cover Blocks
    walls.push({ id: 'w-o1', x: cx - 20, y: 320, w: 40, h: 160, isDestructible: false });
    walls.push({ id: 'w-o2', x: cx - 20, y: MAP_HEIGHT - 480, w: 40, h: 160, isDestructible: false });
    walls.push({ id: 'w-o3', x: 400, y: cy - 20, w: 180, h: 40, isDestructible: false });
    walls.push({ id: 'w-o4', x: MAP_WIDTH - 580, y: cy - 20, w: 180, h: 40, isDestructible: false });

    // Dense Bush Clusters (Tall Grass for stealth)
    const bushClusters = [
      // Central bushes
      { x: cx - 240, y: cy - 200, w: 140, h: 400 },
      { x: cx + 100, y: cy - 200, w: 140, h: 400 },
      { x: cx - 80, y: cy - 180, w: 160, h: 80 },
      { x: cx - 80, y: cy + 100, w: 160, h: 80 },

      // Corner bushes
      { x: 380, y: 340, w: 160, h: 140 },
      { x: MAP_WIDTH - 540, y: 340, w: 160, h: 140 },
      { x: 380, y: MAP_HEIGHT - 480, w: 160, h: 140 },
      { x: MAP_WIDTH - 540, y: MAP_HEIGHT - 480, w: 160, h: 140 },

      // Outer side bushes
      { x: 220, y: cy - 120, w: 120, h: 240 },
      { x: MAP_WIDTH - 340, y: cy - 120, w: 120, h: 240 },
      { x: cx - 180, y: 180, w: 360, h: 90 },
      { x: cx - 180, y: MAP_HEIGHT - 270, w: 360, h: 90 },
    ];

    bushClusters.forEach((b, idx) => {
      bushes.push({ id: `bush-${idx}`, x: b.x, y: b.y, w: b.w, h: b.h });
    });

    // 14 Power Cube Boxes (Wooden chests with 4500 HP)
    const boxPositions = [
      // Center reward boxes (high risk, high reward)
      { x: cx - 40, y: cy - 40 },
      { x: cx + 20, y: cy - 40 },
      { x: cx - 40, y: cy + 20 },
      { x: cx + 20, y: cy + 20 },

      // Perimeter boxes
      { x: 420, y: 240 },
      { x: MAP_WIDTH - 460, y: 240 },
      { x: 420, y: MAP_HEIGHT - 280 },
      { x: MAP_WIDTH - 460, y: MAP_HEIGHT - 280 },
      { x: 620, y: cy },
      { x: MAP_WIDTH - 660, y: cy },
      { x: cx, y: 440 },
      { x: cx, y: MAP_HEIGHT - 480 },
      { x: 740, y: 640 },
      { x: MAP_WIDTH - 780, y: MAP_HEIGHT - 680 },
    ];

    boxPositions.forEach((bp, idx) => {
      boxes.push({
        id: `box-${idx}`,
        x: bp.x,
        y: bp.y,
        w: 48,
        h: 48,
        hp: 4500,
        maxHp: 4500,
      });
    });

    return {
      walls,
      bushes,
      boxes,
      spawns: SHOWDOWN_SPAWNS,
    };

  } else {
    // ================= GEM GRAB MAP (Hard Rock Mine) =================
    const cx = MAP_WIDTH / 2;
    const cy = MAP_HEIGHT / 2;

    // Gem Mine at exact center
    const gemMine: GemMine = {
      x: cx,
      y: cy,
      spawnTimer: 4.5,
      totalSpawned: 0,
    };

    // Central flanking choke walls protecting the mine
    walls.push({ id: 'gm-w1', x: cx - 160, y: cy - 120, w: 35, h: 240, isDestructible: false });
    walls.push({ id: 'gm-w2', x: cx + 125, y: cy - 120, w: 35, h: 240, isDestructible: false });

    // Breakable wood crates covering mine sightlines
    walls.push({ id: 'gm-c1', x: cx - 60, y: cy - 160, w: 120, h: 35, isDestructible: true });
    walls.push({ id: 'gm-c2', x: cx - 60, y: cy + 125, w: 120, h: 35, isDestructible: true });

    // Midfield corridor barricades
    walls.push({ id: 'gm-b1', x: cx - 380, y: cy - 240, w: 140, h: 35, isDestructible: false });
    walls.push({ id: 'gm-b2', x: cx - 380, y: cy + 205, w: 140, h: 35, isDestructible: false });
    walls.push({ id: 'gm-b3', x: cx + 240, y: cy - 240, w: 140, h: 35, isDestructible: false });
    walls.push({ id: 'gm-b4', x: cx + 240, y: cy + 205, w: 140, h: 35, isDestructible: false });

    // Tactical bushes surrounding the gem mine for sneak-in steals
    const gemBushes = [
      { x: cx - 260, y: cy - 180, w: 80, h: 360 },
      { x: cx + 180, y: cy - 180, w: 80, h: 360 },
      { x: cx - 140, y: cy - 260, w: 280, h: 80 },
      { x: cx - 140, y: cy + 180, w: 280, h: 80 },

      // Base approach bushes
      { x: 500, y: cy - 140, w: 140, h: 280 },
      { x: MAP_WIDTH - 640, y: cy - 140, w: 140, h: 280 },
    ];

    gemBushes.forEach((b, idx) => {
      bushes.push({ id: `gem-bush-${idx}`, x: b.x, y: b.y, w: b.w, h: b.h });
    });

    return {
      walls,
      bushes,
      boxes,
      gemMine,
      spawns: GEM_GRAB_SPAWNS,
    };
  }
}
