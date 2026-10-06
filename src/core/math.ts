/**
 * Core math utilities. Allocation-free by design: every helper either returns a
 * primitive or writes into a caller-supplied output object, so the simulation
 * can run at a fixed 60 Hz without producing garbage for the collector.
 */

export const TAU = Math.PI * 2;

export interface Vec2 {
  x: number;
  y: number;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential smoothing. `halfLife` is in seconds. */
export function damp(current: number, target: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return target;
  return target + (current - target) * Math.pow(2, -dt / halfLife);
}

/** Wraps an angle into (-PI, PI]. */
export function wrapAngle(angle: number): number {
  let a = (angle + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Shortest signed delta from `from` to `to`, in (-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}

/** Interpolates angles along the short arc — never spins the long way round. */
export function lerpAngle(from: number, to: number, t: number): number {
  return wrapAngle(from + angleDelta(from, to) * t);
}

/** Rotates `from` towards `to` by at most `maxStep` radians. */
export function rotateTowards(from: number, to: number, maxStep: number): number {
  const delta = angleDelta(from, to);
  if (Math.abs(delta) <= maxStep) return wrapAngle(to);
  return wrapAngle(from + Math.sign(delta) * maxStep);
}

export function distSq(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

export function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(distSq(x1, y1, x2, y2));
}

/** True when the two points are closer than `radius`, without a square root. */
export function withinRange(x1: number, y1: number, x2: number, y2: number, radius: number): boolean {
  return distSq(x1, y1, x2, y2) <= radius * radius;
}

/**
 * Moves `value` towards `target` by at most `maxStep`. Used for acceleration
 * and deceleration curves so movement has weight instead of snapping.
 */
export function moveTowards(value: number, target: number, maxStep: number): number {
  const delta = target - value;
  if (Math.abs(delta) <= maxStep) return target;
  return value + Math.sign(delta) * maxStep;
}

/** Maps `value` from [inMin, inMax] onto [outMin, outMax], clamped at both ends. */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  if (inMax === inMin) return outMin;
  const t = clamp((value - inMin) / (inMax - inMin), 0, 1);
  return outMin + (outMax - outMin) * t;
}

/** Smoothstep easing on a normalised [0, 1] input. */
export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Normalises a vector in place, writing the result into `out`. */
export function normalize(x: number, y: number, out: Vec2): Vec2 {
  const len = Math.hypot(x, y);
  if (len < 1e-6) {
    out.x = 0;
    out.y = 0;
  } else {
    out.x = x / len;
    out.y = y / len;
  }
  return out;
}
