/**
 * How a brawler walks.
 *
 * This used to live inline in the engine's per-brawler update. It is here so
 * that the client can predict its own movement with *the same code* the server
 * runs. A prediction that is merely similar to the server's rules drifts, and
 * every correction is a visible snap; one that is identical can only be wrong
 * about things it could not know — a knockback, another body in the way — and
 * those are rare and small.
 */

import { circleRectCollision } from '../core/collision';
import { moveTowards } from '../core/math';

export interface MoveBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Collision radius shared by every brawler body. */
export const BRAWLER_RADIUS = 22;

/** Stopping is sharper than starting: turns stay responsive while the body still carries weight. */
const STOP_FACTOR = 1.9;

/** Top speed after every modifier that applies right now. */
export function maxSpeedFor(
  baseSpeed: number,
  traitMultiplier: number,
  slowTimer: number,
  speedBoostTimer: number,
  speedBoostMagnitude: number,
  slowAmount = 0.5
): number {
  let speed = baseSpeed * traitMultiplier;
  if (slowTimer > 0) speed *= 1 - (slowAmount > 0 ? slowAmount : 0.5);
  if (speedBoostTimer > 0) speed *= speedBoostMagnitude;
  return speed;
}

/**
 * Pushes a body out of one rectangle, zeroing its velocity along the axis being
 * resolved. Called once per axis so a blocked axis does not cancel the other,
 * which is what makes sliding along cover smooth instead of sticky.
 */
export function pushOutOfRect(b: MoveBody, radius: number, rect: Rect, horizontal: boolean): void {
  const col = circleRectCollision({ x: b.x, y: b.y, radius }, rect);
  if (!col.collided) return;
  b.x += col.nx * col.depth;
  b.y += col.ny * col.depth;
  if (horizontal) b.vx = 0;
  else b.vy = 0;
}

/**
 * Advances a body one step along the player's input.
 *
 * Velocity ramps toward the input rather than snapping to it — instant
 * full-speed starts and dead stops are why movement used to feel like sliding a
 * cursor around instead of driving a character. `resolve` is how the caller
 * says what the body is colliding with, so the server can use its spatial grid
 * and a client can simply walk its list of walls.
 */
export function integrateMovement(
  b: MoveBody,
  moveX: number,
  moveY: number,
  maxSpeed: number,
  acceleration: number,
  rooted: boolean,
  dt: number,
  resolve: (horizontal: boolean) => void
): void {
  let targetVx = 0;
  let targetVy = 0;
  const inputLen = Math.hypot(moveX, moveY);
  // Rooted brawlers keep shooting; they just cannot reposition.
  const isPushing = inputLen > 0.001 && !rooted;
  if (isPushing) {
    const scale = Math.min(1, inputLen) / inputLen;
    targetVx = moveX * scale * maxSpeed;
    targetVy = moveY * scale * maxSpeed;
  }

  const accelStep = acceleration * (isPushing ? 1 : STOP_FACTOR) * dt;
  b.vx = moveTowards(b.vx, targetVx, accelStep);
  b.vy = moveTowards(b.vy, targetVy, accelStep);

  b.x += b.vx * dt;
  resolve(true);
  b.y += b.vy * dt;
  resolve(false);
}
