/**
 * Continuous ("swept") collision detection.
 *
 * The previous engine advanced a projectile by `v * dt` and then asked whether
 * it overlapped anything. At 800 px/s and a 1/60 s step a bullet jumps ~13 px
 * per tick — and on a dropped frame far more — while targets are 22 px across
 * and some walls only 35 px thick. Bullets therefore tunnelled straight
 * through players and cover, which is the single biggest reason shooting felt
 * unreliable.
 *
 * Everything here instead answers "where along this motion did the first
 * contact happen?", so a projectile can never skip past a target no matter how
 * fast it travels.
 */

import { distSq } from './math';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

/** Result of a swept query. Reused across calls to avoid per-tick allocation. */
export interface SweepHit {
  hit: boolean;
  /** Fraction of the motion travelled before contact, in [0, 1]. */
  t: number;
  /** Contact point in world space. */
  x: number;
  y: number;
  /** Surface normal at the contact, pointing away from the obstacle. */
  nx: number;
  ny: number;
}

export function createSweepHit(): SweepHit {
  return { hit: false, t: 1, x: 0, y: 0, nx: 0, ny: 0 };
}

/** Small bias that keeps a resolved body from resting exactly on a surface. */
const EPSILON = 1e-4;

/* ------------------------------------------------------------------ *
 * Discrete overlap tests — still needed for resolving bodies that are
 * already intersecting, and for area-of-effect queries.
 * ------------------------------------------------------------------ */

export function circleIntersect(a: Circle, b: Circle): boolean {
  const r = a.radius + b.radius;
  return distSq(a.x, a.y, b.x, b.y) <= r * r;
}

export function circleOverlapsRect(cx: number, cy: number, radius: number, rect: Rect): boolean {
  const closestX = cx < rect.x ? rect.x : cx > rect.x + rect.w ? rect.x + rect.w : cx;
  const closestY = cy < rect.y ? rect.y : cy > rect.y + rect.h ? rect.y + rect.h : cy;
  return distSq(cx, cy, closestX, closestY) <= radius * radius;
}

export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export interface Penetration {
  collided: boolean;
  nx: number;
  ny: number;
  depth: number;
}

/**
 * Minimum-translation vector pushing a circle out of a rectangle. Used to
 * resolve bodies after integration, where a swept test is not enough because
 * the body may have been pushed into geometry by something else.
 */
export function resolveCircleRect(
  cx: number,
  cy: number,
  radius: number,
  rect: Rect,
  out: Penetration
): Penetration {
  const closestX = cx < rect.x ? rect.x : cx > rect.x + rect.w ? rect.x + rect.w : cx;
  const closestY = cy < rect.y ? rect.y : cy > rect.y + rect.h ? rect.y + rect.h : cy;

  const dx = cx - closestX;
  const dy = cy - closestY;
  const dSq = dx * dx + dy * dy;

  if (dSq > radius * radius) {
    out.collided = false;
    out.nx = 0;
    out.ny = 0;
    out.depth = 0;
    return out;
  }

  if (dSq > EPSILON) {
    const d = Math.sqrt(dSq);
    out.collided = true;
    out.nx = dx / d;
    out.ny = dy / d;
    out.depth = radius - d;
    return out;
  }

  // Centre is inside the rectangle: eject along the shallowest axis.
  const left = cx - rect.x;
  const right = rect.x + rect.w - cx;
  const top = cy - rect.y;
  const bottom = rect.y + rect.h - cy;
  const min = Math.min(left, right, top, bottom);

  out.collided = true;
  if (min === left) {
    out.nx = -1;
    out.ny = 0;
    out.depth = radius + left;
  } else if (min === right) {
    out.nx = 1;
    out.ny = 0;
    out.depth = radius + right;
  } else if (min === top) {
    out.nx = 0;
    out.ny = -1;
    out.depth = radius + top;
  } else {
    out.nx = 0;
    out.ny = 1;
    out.depth = radius + bottom;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Swept tests
 * ------------------------------------------------------------------ */

/**
 * Sweeps a circle of `radius` from (cx, cy) along (dx, dy) against a static
 * rectangle.
 *
 * Works on the Minkowski sum: the rectangle grown by `radius` turns the moving
 * circle into a moving point, so the broad answer is a ray/AABB slab test. The
 * grown shape has square corners where the true shape is rounded, so a contact
 * that lands in a corner region is refined against the exact corner vertex.
 */
export function sweepCircleVsRect(
  cx: number,
  cy: number,
  radius: number,
  dx: number,
  dy: number,
  rect: Rect,
  out: SweepHit
): SweepHit {
  out.hit = false;
  out.t = 1;

  const minX = rect.x - radius;
  const minY = rect.y - radius;
  const maxX = rect.x + rect.w + radius;
  const maxY = rect.y + rect.h + radius;

  // Already inside the expanded box: treat as an immediate contact so the
  // caller can resolve it rather than letting the body pass through.
  if (cx > minX && cx < maxX && cy > minY && cy < maxY) {
    out.hit = true;
    out.t = 0;
    out.x = cx;
    out.y = cy;
    const pen = resolveCircleRect(cx, cy, radius, rect, SHARED_PENETRATION);
    out.nx = pen.nx;
    out.ny = pen.ny;
    return out;
  }

  let tEnter = 0;
  let tExit = 1;
  let normalX = 0;
  let normalY = 0;

  // X slab
  if (Math.abs(dx) < EPSILON) {
    if (cx < minX || cx > maxX) return out;
  } else {
    const inv = 1 / dx;
    let t0 = (minX - cx) * inv;
    let t1 = (maxX - cx) * inv;
    let sign = -1;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
      sign = 1;
    }
    if (t0 > tEnter) {
      tEnter = t0;
      normalX = sign;
      normalY = 0;
    }
    if (t1 < tExit) tExit = t1;
    if (tEnter > tExit) return out;
  }

  // Y slab
  if (Math.abs(dy) < EPSILON) {
    if (cy < minY || cy > maxY) return out;
  } else {
    const inv = 1 / dy;
    let t0 = (minY - cy) * inv;
    let t1 = (maxY - cy) * inv;
    let sign = -1;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
      sign = 1;
    }
    if (t0 > tEnter) {
      tEnter = t0;
      normalX = 0;
      normalY = sign;
    }
    if (t1 < tExit) tExit = t1;
    if (tEnter > tExit) return out;
  }

  if (tEnter > 1 || tEnter < 0) return out;

  const hitX = cx + dx * tEnter;
  const hitY = cy + dy * tEnter;

  // Corner refinement: if the contact sits beyond the face on the other axis,
  // the real first contact is against the rounded corner, not the flat side.
  const beyondX = normalX !== 0 && (hitY < rect.y || hitY > rect.y + rect.h);
  const beyondY = normalY !== 0 && (hitX < rect.x || hitX > rect.x + rect.w);

  if (beyondX || beyondY) {
    const cornerX = hitX < rect.x + rect.w * 0.5 ? rect.x : rect.x + rect.w;
    const cornerY = hitY < rect.y + rect.h * 0.5 ? rect.y : rect.y + rect.h;
    return sweepCircleVsPoint(cx, cy, radius, dx, dy, cornerX, cornerY, out);
  }

  out.hit = true;
  out.t = tEnter;
  out.x = hitX;
  out.y = hitY;
  out.nx = normalX;
  out.ny = normalY;
  return out;
}

const SHARED_PENETRATION: Penetration = { collided: false, nx: 0, ny: 0, depth: 0 };

/**
 * Convenience wrapper around `resolveCircleRect` that writes into a shared
 * buffer. The result is only valid until the next call — read it immediately.
 */
export function circleRectCollision(circle: Circle, rect: Rect): Penetration {
  return resolveCircleRect(circle.x, circle.y, circle.radius, rect, SHARED_PENETRATION);
}

/** Sweeps a circle against a single point (a rectangle corner). */
export function sweepCircleVsPoint(
  cx: number,
  cy: number,
  radius: number,
  dx: number,
  dy: number,
  px: number,
  py: number,
  out: SweepHit
): SweepHit {
  return sweepCircleVsCircle(cx, cy, radius, dx, dy, px, py, 0, out);
}

/**
 * Sweeps a moving circle against a static circle. Solves the quadratic
 * |(P + Vt) - C|^2 = (r1 + r2)^2 for the smallest root in [0, 1].
 */
export function sweepCircleVsCircle(
  cx: number,
  cy: number,
  radius: number,
  dx: number,
  dy: number,
  tx: number,
  ty: number,
  targetRadius: number,
  out: SweepHit
): SweepHit {
  out.hit = false;
  out.t = 1;

  const r = radius + targetRadius;
  const ox = cx - tx;
  const oy = cy - ty;

  const a = dx * dx + dy * dy;
  const c = ox * ox + oy * oy - r * r;

  // Already overlapping at the start of the step.
  if (c <= 0) {
    const d = Math.sqrt(ox * ox + oy * oy) || 1;
    out.hit = true;
    out.t = 0;
    out.x = cx;
    out.y = cy;
    out.nx = ox / d;
    out.ny = oy / d;
    return out;
  }

  if (a < EPSILON) return out;

  const b = ox * dx + oy * dy;
  // Moving away from the target.
  if (b >= 0) return out;

  const discriminant = b * b - a * c;
  if (discriminant < 0) return out;

  const t = (-b - Math.sqrt(discriminant)) / a;
  if (t < 0 || t > 1) return out;

  const hitX = cx + dx * t;
  const hitY = cy + dy * t;
  const nx = (hitX - tx) / r;
  const ny = (hitY - ty) / r;

  out.hit = true;
  out.t = t;
  out.x = hitX;
  out.y = hitY;
  out.nx = nx;
  out.ny = ny;
  return out;
}

/* ------------------------------------------------------------------ *
 * Line of sight
 * ------------------------------------------------------------------ */

/**
 * True when the segment from (x1, y1) to (x2, y2) crosses the rectangle.
 * Slab test on the segment's parametric form — no division by zero, no
 * allocation, and far cheaper than the four edge/edge tests it replaces.
 */
export function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: Rect
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;

  let tEnter = 0;
  let tExit = 1;

  if (Math.abs(dx) < EPSILON) {
    if (x1 < rect.x || x1 > rect.x + rect.w) return false;
  } else {
    const inv = 1 / dx;
    let t0 = (rect.x - x1) * inv;
    let t1 = (rect.x + rect.w - x1) * inv;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
    }
    if (t0 > tEnter) tEnter = t0;
    if (t1 < tExit) tExit = t1;
    if (tEnter > tExit) return false;
  }

  if (Math.abs(dy) < EPSILON) {
    if (y1 < rect.y || y1 > rect.y + rect.h) return false;
  } else {
    const inv = 1 / dy;
    let t0 = (rect.y - y1) * inv;
    let t1 = (rect.y + rect.h - y1) * inv;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
    }
    if (t0 > tEnter) tEnter = t0;
    if (t1 < tExit) tExit = t1;
    if (tEnter > tExit) return false;
  }

  return true;
}

/** True when nothing in `blockers` stands between the two points. */
export function hasLineOfSight(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  blockers: readonly Rect[]
): boolean {
  for (let i = 0; i < blockers.length; i++) {
    if (segmentIntersectsRect(x1, y1, x2, y2, blockers[i])) return false;
  }
  return true;
}
