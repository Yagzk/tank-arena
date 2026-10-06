import { describe, expect, it } from 'vitest';
import {
  createSweepHit,
  hasLineOfSight,
  resolveCircleRect,
  segmentIntersectsRect,
  sweepCircleVsCircle,
  sweepCircleVsRect,
  type Penetration,
} from './collision';

const wall = { x: 100, y: 0, w: 20, h: 200 };

function penetration(): Penetration {
  return { collided: false, nx: 0, ny: 0, depth: 0 };
}

describe('sweepCircleVsRect', () => {
  it('catches a step that would otherwise jump clean over a thin wall', () => {
    // This is the regression the whole module exists for: a 4 px projectile
    // moving 200 px in one step past a 20 px wall. A discrete overlap test at
    // the start and end positions finds nothing.
    const hit = sweepCircleVsRect(50, 100, 4, 200, 0, wall, createSweepHit());

    expect(hit.hit).toBe(true);
    // Contact at the near face, offset by the projectile radius.
    expect(hit.x).toBeCloseTo(96, 5);
    expect(hit.nx).toBe(-1);
  });

  it('reports contact as a fraction of the step', () => {
    const hit = sweepCircleVsRect(50, 100, 4, 100, 0, wall, createSweepHit());
    expect(hit.t).toBeCloseTo(0.46, 5);
  });

  it('misses when the path passes the rectangle entirely', () => {
    const hit = sweepCircleVsRect(50, 400, 4, 200, 0, wall, createSweepHit());
    expect(hit.hit).toBe(false);
    expect(hit.t).toBe(1);
  });

  it('misses by exactly the radius at a grazing distance', () => {
    // Travelling parallel, 5 px clear of a 4 px radius: no contact.
    const clear = sweepCircleVsRect(50, 209, 4, 200, 0, wall, createSweepHit());
    expect(clear.hit).toBe(false);

    // Same path 2 px closer: contact.
    const grazed = sweepCircleVsRect(50, 203, 4, 200, 0, wall, createSweepHit());
    expect(grazed.hit).toBe(true);
  });

  it('rounds corners instead of treating them as square', () => {
    // Travelling left, 15 px below the bottom edge of a wall whose corner is at
    // (120, 200), with a 20 px radius: the body clips the corner, not a face.
    //
    // Working on the rectangle expanded by the radius alone would report
    // contact against the flat right face at x = 140 with a normal of (1, 0) —
    // too early, and pointing the wrong way. The corner is a rounded vertex, so
    // contact is later and the normal is diagonal.
    const hit = sweepCircleVsRect(200, 215, 20, -120, 0, wall, createSweepHit());

    expect(hit.hit).toBe(true);
    expect(hit.x).toBeLessThan(140);
    expect(hit.nx).toBeGreaterThan(0.1);
    expect(hit.ny).toBeGreaterThan(0.1);
    // Normals from a corner hit are unit length.
    expect(Math.hypot(hit.nx, hit.ny)).toBeCloseTo(1, 6);
  });

  it('treats an overlapping start as immediate contact', () => {
    const hit = sweepCircleVsRect(110, 100, 10, 50, 0, wall, createSweepHit());
    expect(hit.hit).toBe(true);
    expect(hit.t).toBe(0);
  });
});

describe('sweepCircleVsCircle', () => {
  it('finds the first of the two intersection points', () => {
    const hit = sweepCircleVsCircle(0, 0, 5, 100, 0, 50, 0, 10, createSweepHit());
    expect(hit.hit).toBe(true);
    // Contact when the gap closes to r1 + r2 = 15.
    expect(hit.x).toBeCloseTo(35, 5);
  });

  it('ignores a target the body is moving away from', () => {
    const hit = sweepCircleVsCircle(100, 0, 5, 100, 0, 50, 0, 10, createSweepHit());
    expect(hit.hit).toBe(false);
  });

  it('does not report contact beyond the end of the step', () => {
    const hit = sweepCircleVsCircle(0, 0, 5, 10, 0, 500, 0, 10, createSweepHit());
    expect(hit.hit).toBe(false);
  });

  it('catches a fast projectile against a body it would step over', () => {
    // 22 px body, 13 px step: the classic tunnelling case at tick rate.
    const hit = sweepCircleVsCircle(0, 0, 4, 60, 0, 30, 0, 22, createSweepHit());
    expect(hit.hit).toBe(true);
    expect(hit.t).toBeLessThan(1);
  });
});

describe('resolveCircleRect', () => {
  it('pushes out along the shortest axis', () => {
    const out = resolveCircleRect(98, 100, 10, wall, penetration());
    expect(out.collided).toBe(true);
    expect(out.nx).toBe(-1);
    expect(out.depth).toBeCloseTo(8, 5);
  });

  it('ejects a centre that is fully inside', () => {
    const out = resolveCircleRect(105, 100, 10, wall, penetration());
    expect(out.collided).toBe(true);
    // Nearest face is the left one, 5 px away.
    expect(out.nx).toBe(-1);
    expect(out.depth).toBeCloseTo(15, 5);
  });

  it('reports no contact when clear', () => {
    expect(resolveCircleRect(50, 100, 10, wall, penetration()).collided).toBe(false);
  });
});

describe('segmentIntersectsRect', () => {
  it('detects a crossing segment', () => {
    expect(segmentIntersectsRect(50, 100, 200, 100, wall)).toBe(true);
  });

  it('rejects a segment that stops short', () => {
    expect(segmentIntersectsRect(50, 100, 90, 100, wall)).toBe(false);
  });

  it('rejects a segment that passes outside', () => {
    expect(segmentIntersectsRect(50, 300, 200, 300, wall)).toBe(false);
  });

  it('handles axis-aligned segments without dividing by zero', () => {
    expect(segmentIntersectsRect(110, -50, 110, 300, wall)).toBe(true);
    expect(segmentIntersectsRect(50, -50, 50, 300, wall)).toBe(false);
  });
});

describe('hasLineOfSight', () => {
  it('is blocked by any one obstacle', () => {
    expect(hasLineOfSight(50, 100, 200, 100, [wall])).toBe(false);
  });

  it('is clear when every obstacle is off the line', () => {
    expect(hasLineOfSight(50, 300, 200, 300, [wall])).toBe(true);
  });
});
