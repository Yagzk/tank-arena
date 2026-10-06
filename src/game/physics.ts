import { Wall } from '../types/game';

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

export function distSq(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

export function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(distSq(x1, y1, x2, y2));
}

// Circle to Circle intersection
export function circleIntersect(c1: Circle, c2: Circle): boolean {
  const r = c1.radius + c2.radius;
  return distSq(c1.x, c1.y, c2.x, c2.y) <= r * r;
}

// Circle to Rectangle (Wall/Crate) collision check & penetration vector
export function circleRectCollision(circle: Circle, rect: Wall): { collided: boolean; nx: number; ny: number; depth: number } {
  // Find closest point on rectangle to circle center
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));

  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  const dSq = dx * dx + dy * dy;

  if (dSq <= circle.radius * circle.radius) {
    const d = Math.sqrt(dSq);
    if (d === 0) {
      // Circle center inside rect, push out towards nearest edge
      const leftDist = circle.x - rect.x;
      const rightDist = rect.x + rect.w - circle.x;
      const topDist = circle.y - rect.y;
      const bottomDist = rect.y + rect.h - circle.y;
      const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);

      if (minDist === leftDist) return { collided: true, nx: -1, ny: 0, depth: circle.radius + leftDist };
      if (minDist === rightDist) return { collided: true, nx: 1, ny: 0, depth: circle.radius + rightDist };
      if (minDist === topDist) return { collided: true, nx: 0, ny: -1, depth: circle.radius + topDist };
      return { collided: true, nx: 0, ny: 1, depth: circle.radius + bottomDist };
    }
    return {
      collided: true,
      nx: dx / d,
      ny: dy / d,
      depth: circle.radius - d,
    };
  }

  return { collided: false, nx: 0, ny: 0, depth: 0 };
}

// Bullet bounce against rectangle wall
export function bounceBulletAgainstWall(
  bx: number,
  by: number,
  bvx: number,
  bvy: number,
  radius: number,
  wall: Wall
): { bounced: boolean; newVx: number; newVy: number; newX: number; newY: number } {
  const col = circleRectCollision({ x: bx, y: by, radius }, wall);
  if (!col.collided) {
    return { bounced: false, newVx: bvx, newVy: bvy, newX: bx, newY: by };
  }

  // Push bullet back outside the wall
  const newX = bx + col.nx * (col.depth + 1);
  const newY = by + col.ny * (col.depth + 1);

  // Reflect velocity along normal
  // If hit horizontal edge (|ny| > |nx|), reverse vy. If vertical (|nx| > |ny|), reverse vx.
  let newVx = bvx;
  let newVy = bvy;

  if (Math.abs(col.nx) > Math.abs(col.ny)) {
    newVx = -bvx;
  } else {
    newVy = -bvy;
  }

  return { bounced: true, newVx, newVy, newX, newY };
}

// Check line of sight between two points (e.g. for AI bot aiming)
export function hasLineOfSight(x1: number, y1: number, x2: number, y2: number, walls: Wall[]): boolean {
  for (const wall of walls) {
    if (lineIntersectsRect(x1, y1, x2, y2, wall)) {
      return false;
    }
  }
  return true;
}

function lineIntersectsLine(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): boolean {
  const uA = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));
  const uB = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));
  return uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1;
}

function lineIntersectsRect(x1: number, y1: number, x2: number, y2: number, rect: Wall): boolean {
  const rx = rect.x;
  const ry = rect.y;
  const rw = rect.w;
  const rh = rect.h;

  return (
    lineIntersectsLine(x1, y1, x2, y2, rx, ry, rx + rw, ry) || // Top
    lineIntersectsLine(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh) || // Right
    lineIntersectsLine(x1, y1, x2, y2, rx, ry + rh, rx + rw, ry + rh) || // Bottom
    lineIntersectsLine(x1, y1, x2, y2, rx, ry, rx, ry + rh) // Left
  );
}
