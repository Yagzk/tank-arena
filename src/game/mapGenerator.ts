import { Wall } from '../types/game';

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

export function generateMap(layoutIndex: number = 0): Wall[] {
  const walls: Wall[] = [];

  // Outer border
  walls.push({ x: 0, y: 0, w: ARENA_WIDTH, h: WALL_THICKNESS, isDestructible: false }); // Top
  walls.push({ x: 0, y: ARENA_HEIGHT - WALL_THICKNESS, w: ARENA_WIDTH, h: WALL_THICKNESS, isDestructible: false }); // Bottom
  walls.push({ x: 0, y: 0, w: WALL_THICKNESS, h: ARENA_HEIGHT, isDestructible: false }); // Left
  walls.push({ x: ARENA_WIDTH - WALL_THICKNESS, y: 0, w: WALL_THICKNESS, h: ARENA_HEIGHT, isDestructible: false }); // Right

  const mode = layoutIndex % 3;

  if (mode === 0) {
    // Layout 1: Cyber Crossfire & Crates
    // Center bunker
    walls.push({ x: ARENA_WIDTH / 2 - 80, y: ARENA_HEIGHT / 2 - 80, w: 160, h: 20, isDestructible: false });
    walls.push({ x: ARENA_WIDTH / 2 - 80, y: ARENA_HEIGHT / 2 + 60, w: 160, h: 20, isDestructible: false });
    walls.push({ x: ARENA_WIDTH / 2 - 80, y: ARENA_HEIGHT / 2 - 60, w: 20, h: 120, isDestructible: false });
    walls.push({ x: ARENA_WIDTH / 2 + 60, y: ARENA_HEIGHT / 2 - 60, w: 20, h: 120, isDestructible: false });

    // Mid columns
    walls.push({ x: 300, y: 200, w: 30, h: 160, isDestructible: false });
    walls.push({ x: 300, y: ARENA_HEIGHT - 360, w: 30, h: 160, isDestructible: false });
    walls.push({ x: ARENA_WIDTH - 330, y: 200, w: 30, h: 160, isDestructible: false });
    walls.push({ x: ARENA_WIDTH - 330, y: ARENA_HEIGHT - 360, w: 30, h: 160, isDestructible: false });

    // Horizontal bars
    walls.push({ x: 450, y: 150, w: 300, h: 25, isDestructible: false });
    walls.push({ x: 450, y: ARENA_HEIGHT - 175, w: 300, h: 25, isDestructible: false });

    // Destructible crates in central quadrants
    const crateSize = 40;
    const cratePositions = [
      { x: 330, y: 380 }, { x: 370, y: 380 },
      { x: ARENA_WIDTH - 410, y: 380 }, { x: ARENA_WIDTH - 370, y: 380 },
      { x: ARENA_WIDTH / 2 - 20, y: 230 }, { x: ARENA_WIDTH / 2 - 20, y: 270 },
      { x: ARENA_WIDTH / 2 - 20, y: ARENA_HEIGHT - 270 }, { x: ARENA_WIDTH / 2 - 20, y: ARENA_HEIGHT - 310 },
      { x: 200, y: 380 }, { x: ARENA_WIDTH - 240, y: 380 }
    ];

    cratePositions.forEach(p => {
      walls.push({ x: p.x, y: p.y, w: crateSize, h: crateSize, isDestructible: true, hp: 1 });
    });
  } else if (mode === 1) {
    // Layout 2: Classic Arena Chokepoints
    // Two large central dividing walls with center gap
    walls.push({ x: ARENA_WIDTH / 2 - 15, y: 120, w: 30, h: 200, isDestructible: false });
    walls.push({ x: ARENA_WIDTH / 2 - 15, y: ARENA_HEIGHT - 320, w: 30, h: 200, isDestructible: false });

    // Side barricades
    walls.push({ x: 260, y: 260, w: 180, h: 30, isDestructible: false });
    walls.push({ x: 260, y: ARENA_HEIGHT - 290, w: 180, h: 30, isDestructible: false });
    walls.push({ x: ARENA_WIDTH - 440, y: 260, w: 180, h: 30, isDestructible: false });
    walls.push({ x: ARENA_WIDTH - 440, y: ARENA_HEIGHT - 290, w: 180, h: 30, isDestructible: false });

    // Destructible crates blocking the center gap and side wings
    const crateSize = 40;
    for (let y = 340; y <= 420; y += 40) {
      walls.push({ x: ARENA_WIDTH / 2 - 20, y, w: crateSize, h: crateSize, isDestructible: true, hp: 1 });
    }
    walls.push({ x: 260, y: 390, w: crateSize, h: crateSize, isDestructible: true, hp: 1 });
    walls.push({ x: ARENA_WIDTH - 300, y: 390, w: crateSize, h: crateSize, isDestructible: true, hp: 1 });
  } else {
    // Layout 3: Tactical Pillars & Mazes
    const pillars = [
      { x: 300, y: 220 }, { x: 300, y: ARENA_HEIGHT - 260 },
      { x: ARENA_WIDTH - 340, y: 220 }, { x: ARENA_WIDTH - 340, y: ARENA_HEIGHT - 260 },
      { x: ARENA_WIDTH / 2 - 20, y: ARENA_HEIGHT / 2 - 20 }
    ];

    pillars.forEach(p => {
      walls.push({ x: p.x, y: p.y, w: 50, h: 50, isDestructible: false });
    });

    // Horizontal bars
    walls.push({ x: 420, y: 280, w: 120, h: 25, isDestructible: false });
    walls.push({ x: ARENA_WIDTH - 540, y: 280, w: 120, h: 25, isDestructible: false });
    walls.push({ x: 420, y: ARENA_HEIGHT - 305, w: 120, h: 25, isDestructible: false });
    walls.push({ x: ARENA_WIDTH - 540, y: ARENA_HEIGHT - 305, w: 120, h: 25, isDestructible: false });

    // Lots of destructible blocks
    const crateSize = 40;
    const crates = [
      { x: 480, y: ARENA_HEIGHT / 2 - 20 },
      { x: ARENA_WIDTH - 520, y: ARENA_HEIGHT / 2 - 20 },
      { x: ARENA_WIDTH / 2 - 20, y: 250 },
      { x: ARENA_WIDTH / 2 - 20, y: ARENA_HEIGHT - 290 },
      { x: 200, y: 280 },
      { x: ARENA_WIDTH - 240, y: 280 },
      { x: 200, y: ARENA_HEIGHT - 320 },
      { x: ARENA_WIDTH - 240, y: ARENA_HEIGHT - 320 }
    ];

    crates.forEach(c => {
      walls.push({ x: c.x, y: c.y, w: crateSize, h: crateSize, isDestructible: true, hp: 1 });
    });
  }

  return walls;
}
