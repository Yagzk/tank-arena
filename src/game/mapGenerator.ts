import { Wall, ExplosiveBarrel, BoostPad, Portal, BiomeType } from '../types/game';

export const ARENA_WIDTH = 1200;
export const ARENA_HEIGHT = 800;
export const WALL_THICKNESS = 20;

export interface SpawnPoint {
  x: number;
  y: number;
  angle: number;
}

export const SPAWN_POINTS: SpawnPoint[] = [
  { x: 140, y: 140, angle: Math.PI / 4 }, // Top Left
  { x: ARENA_WIDTH - 140, y: ARENA_HEIGHT - 140, angle: (5 * Math.PI) / 4 }, // Bottom Right
  { x: ARENA_WIDTH - 140, y: 140, angle: (3 * Math.PI) / 4 }, // Top Right
  { x: 140, y: ARENA_HEIGHT - 140, angle: (7 * Math.PI) / 4 }, // Bottom Left
];

export interface MapData {
  biome: BiomeType;
  walls: Wall[];
  barrels: ExplosiveBarrel[];
  boostPads: BoostPad[];
  portals: Portal[];
}

export function generateMap(layoutIndex: number = 0): MapData {
  const walls: Wall[] = [];
  const barrels: ExplosiveBarrel[] = [];
  const boostPads: BoostPad[] = [];
  const portals: Portal[] = [];

  // Outer border
  walls.push({ x: 0, y: 0, w: ARENA_WIDTH, h: WALL_THICKNESS, isDestructible: false }); // Top
  walls.push({ x: 0, y: ARENA_HEIGHT - WALL_THICKNESS, w: ARENA_WIDTH, h: WALL_THICKNESS, isDestructible: false }); // Bottom
  walls.push({ x: 0, y: 0, w: WALL_THICKNESS, h: ARENA_HEIGHT, isDestructible: false }); // Left
  walls.push({ x: ARENA_WIDTH - WALL_THICKNESS, y: 0, w: WALL_THICKNESS, h: ARENA_HEIGHT, isDestructible: false }); // Right

  const mode = layoutIndex % 3;
  let biome: BiomeType = 'cyber';

  if (mode === 0) {
    // 1. BIOME: CYBER CORE (Neon portals, tech corridors, speed pads)
    biome = 'cyber';

    // Central core structure
    walls.push({ x: ARENA_WIDTH / 2 - 90, y: ARENA_HEIGHT / 2 - 90, w: 180, h: 20, isDestructible: false });
    walls.push({ x: ARENA_WIDTH / 2 - 90, y: ARENA_HEIGHT / 2 + 70, w: 180, h: 20, isDestructible: false });
    walls.push({ x: ARENA_WIDTH / 2 - 90, y: ARENA_HEIGHT / 2 - 70, w: 20, h: 140, isDestructible: false });
    walls.push({ x: ARENA_WIDTH / 2 + 70, y: ARENA_HEIGHT / 2 - 70, w: 20, h: 140, isDestructible: false });

    // Lateral defense wings
    walls.push({ x: 280, y: 180, w: 25, h: 180, isDestructible: false });
    walls.push({ x: 280, y: ARENA_HEIGHT - 360, w: 25, h: 180, isDestructible: false });
    walls.push({ x: ARENA_WIDTH - 305, y: 180, w: 25, h: 180, isDestructible: false });
    walls.push({ x: ARENA_WIDTH - 305, y: ARENA_HEIGHT - 360, w: 25, h: 180, isDestructible: false });

    // Destructible crates
    const crateSize = 40;
    const crates = [
      { x: 340, y: 380 }, { x: 380, y: 380 },
      { x: ARENA_WIDTH - 420, y: 380 }, { x: ARENA_WIDTH - 380, y: 380 },
      { x: ARENA_WIDTH / 2 - 20, y: 220 }, { x: ARENA_WIDTH / 2 - 20, y: 260 },
      { x: ARENA_WIDTH / 2 - 20, y: ARENA_HEIGHT - 260 }, { x: ARENA_WIDTH / 2 - 20, y: ARENA_HEIGHT - 300 }
    ];
    crates.forEach(c => walls.push({ x: c.x, y: c.y, w: crateSize, h: crateSize, isDestructible: true, hp: 1 }));

    // Explosive Barrels
    const barrelPos = [
      { x: 340, y: 240 }, { x: 340, y: ARENA_HEIGHT - 240 },
      { x: ARENA_WIDTH - 340, y: 240 }, { x: ARENA_WIDTH - 340, y: ARENA_HEIGHT - 240 },
      { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 }
    ];
    barrelPos.forEach((b, i) => barrels.push({
      id: `barrel-${i}`,
      x: b.x,
      y: b.y,
      radius: 16,
      hp: 1,
      maxHp: 1,
      isExploded: false
    }));

    // Speed Boost Pads (Directing towards center)
    boostPads.push({ x: 170, y: 380, w: 50, h: 30, dirX: 1, dirY: 0 });
    boostPads.push({ x: ARENA_WIDTH - 220, y: 380, w: 50, h: 30, dirX: -1, dirY: 0 });

    // Teleport Portals (Top Right <-> Bottom Left)
    portals.push({
      id: 'p1',
      x: 170,
      y: ARENA_HEIGHT - 170,
      targetX: ARENA_WIDTH - 170,
      targetY: 170,
      radius: 24,
      color: '#06b6d4',
      cooldownTanks: {}
    });
    portals.push({
      id: 'p2',
      x: ARENA_WIDTH - 170,
      y: 170,
      targetX: 170,
      targetY: ARENA_HEIGHT - 170,
      radius: 24,
      color: '#f97316',
      cooldownTanks: {}
    });

  } else if (mode === 1) {
    // 2. BIOME: MAGMA REACTOR (Hot volcanic barriers, lots of explosive canisters, jump pads)
    biome = 'magma';

    // Central dividing choke points
    walls.push({ x: ARENA_WIDTH / 2 - 15, y: 100, w: 30, h: 220, isDestructible: false });
    walls.push({ x: ARENA_WIDTH / 2 - 15, y: ARENA_HEIGHT - 320, w: 30, h: 220, isDestructible: false });

    // Lateral fortresses
    walls.push({ x: 260, y: 240, w: 160, h: 30, isDestructible: false });
    walls.push({ x: 260, y: ARENA_HEIGHT - 270, w: 160, h: 30, isDestructible: false });
    walls.push({ x: ARENA_WIDTH - 420, y: 240, w: 160, h: 30, isDestructible: false });
    walls.push({ x: ARENA_WIDTH - 420, y: ARENA_HEIGHT - 270, w: 160, h: 30, isDestructible: false });

    // Destructible Crates in central crossing
    const crateSize = 40;
    for (let y = 340; y <= 420; y += 40) {
      walls.push({ x: ARENA_WIDTH / 2 - 20, y, w: crateSize, h: crateSize, isDestructible: true, hp: 1 });
    }
    walls.push({ x: 260, y: 380, w: crateSize, h: crateSize, isDestructible: true, hp: 1 });
    walls.push({ x: ARENA_WIDTH - 300, y: 380, w: crateSize, h: crateSize, isDestructible: true, hp: 1 });

    // Explosive Barrels placed in high-traffic corridors
    const barrelPos = [
      { x: ARENA_WIDTH / 2 - 60, y: 340 },
      { x: ARENA_WIDTH / 2 + 60, y: 460 },
      { x: 440, y: 255 },
      { x: ARENA_WIDTH - 440, y: ARENA_HEIGHT - 255 },
      { x: 260, y: 150 },
      { x: ARENA_WIDTH - 260, y: ARENA_HEIGHT - 150 }
    ];
    barrelPos.forEach((b, i) => barrels.push({
      id: `barrel-magma-${i}`,
      x: b.x,
      y: b.y,
      radius: 17,
      hp: 1,
      maxHp: 1,
      isExploded: false
    }));

    // Boost Pads
    boostPads.push({ x: ARENA_WIDTH / 2 - 25, y: 40, w: 50, h: 30, dirX: 0, dirY: 1 });
    boostPads.push({ x: ARENA_WIDTH / 2 - 25, y: ARENA_HEIGHT - 70, w: 50, h: 30, dirX: 0, dirY: -1 });

    // Wormholes
    portals.push({
      id: 'p1',
      x: 200,
      y: 200,
      targetX: ARENA_WIDTH - 200,
      targetY: ARENA_HEIGHT - 200,
      radius: 24,
      color: '#ef4444',
      cooldownTanks: {}
    });
    portals.push({
      id: 'p2',
      x: ARENA_WIDTH - 200,
      y: ARENA_HEIGHT - 200,
      targetX: 200,
      targetY: 200,
      radius: 24,
      color: '#f59e0b',
      cooldownTanks: {}
    });

  } else {
    // 3. BIOME: FROST FORTRESS (Slick iced combat, diamond pillars, tactical corridors)
    biome = 'frost';

    // 4 Corner diamond pillars
    const pillars = [
      { x: 340, y: 240 }, { x: 340, y: ARENA_HEIGHT - 280 },
      { x: ARENA_WIDTH - 380, y: 240 }, { x: ARENA_WIDTH - 380, y: ARENA_HEIGHT - 280 },
      { x: ARENA_WIDTH / 2 - 25, y: ARENA_HEIGHT / 2 - 25 }
    ];
    pillars.forEach(p => {
      walls.push({ x: p.x, y: p.y, w: 50, h: 50, isDestructible: false });
    });

    // Horizontal bars
    walls.push({ x: 440, y: 260, w: 140, h: 25, isDestructible: false });
    walls.push({ x: ARENA_WIDTH - 580, y: 260, w: 140, h: 25, isDestructible: false });
    walls.push({ x: 440, y: ARENA_HEIGHT - 285, w: 140, h: 25, isDestructible: false });
    walls.push({ x: ARENA_WIDTH - 580, y: ARENA_HEIGHT - 285, w: 140, h: 25, isDestructible: false });

    // Destructible Ice Crates
    const crateSize = 40;
    const crates = [
      { x: 500, y: ARENA_HEIGHT / 2 - 20 },
      { x: ARENA_WIDTH - 540, y: ARENA_HEIGHT / 2 - 20 },
      { x: ARENA_WIDTH / 2 - 20, y: 220 },
      { x: ARENA_WIDTH / 2 - 20, y: ARENA_HEIGHT - 260 },
      { x: 220, y: 380 },
      { x: ARENA_WIDTH - 260, y: 380 }
    ];
    crates.forEach(c => walls.push({ x: c.x, y: c.y, w: crateSize, h: crateSize, isDestructible: true, hp: 1 }));

    // Barrels
    const barrelPos = [
      { x: ARENA_WIDTH / 2, y: 280 },
      { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT - 280 },
      { x: 340, y: 380 },
      { x: ARENA_WIDTH - 340, y: 380 }
    ];
    barrelPos.forEach((b, i) => barrels.push({
      id: `barrel-frost-${i}`,
      x: b.x,
      y: b.y,
      radius: 16,
      hp: 1,
      maxHp: 1,
      isExploded: false
    }));

    // Speed Boost Pads
    boostPads.push({ x: 340, y: 150, w: 50, h: 30, dirX: 1, dirY: 0 });
    boostPads.push({ x: ARENA_WIDTH - 390, y: ARENA_HEIGHT - 180, w: 50, h: 30, dirX: -1, dirY: 0 });

    // Portals (Top Left <-> Bottom Right)
    portals.push({
      id: 'p1',
      x: 160,
      y: 160,
      targetX: ARENA_WIDTH - 160,
      targetY: ARENA_HEIGHT - 160,
      radius: 24,
      color: '#38bdf8',
      cooldownTanks: {}
    });
    portals.push({
      id: 'p2',
      x: ARENA_WIDTH - 160,
      y: ARENA_HEIGHT - 160,
      targetX: 160,
      targetY: 160,
      radius: 24,
      color: '#a855f7',
      cooldownTanks: {}
    });
  }

  return { biome, walls, barrels, boostPads, portals };
}
