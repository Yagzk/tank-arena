import { describe, expect, it } from 'vitest';
import { NavGrid, UNREACHABLE } from './navGrid';

/** A wall spanning the middle of the map with a gap at the bottom. */
const PARTIAL_WALL = [{ x: 180, y: 0, w: 40, h: 300 }];
/** The same wall sealed from edge to edge. */
const FULL_WALL = [{ x: 180, y: 0, w: 40, h: 400 }];

function gridWith(blockers: { x: number; y: number; w: number; h: number }[], radius = 0) {
  const nav = new NavGrid(400, 400, 20);
  nav.rebuild([blockers], radius);
  return nav;
}

describe('NavGrid', () => {
  it('marks cells covered by an obstacle as blocked', () => {
    const nav = gridWith(PARTIAL_WALL);
    expect(nav.isBlockedAt(200, 100)).toBe(true);
    expect(nav.isBlockedAt(100, 100)).toBe(false);
  });

  it('inflates obstacles by the agent radius', () => {
    // 30 px clear of the wall is walkable for a point, but not for a body with
    // a 40 px radius — otherwise bots path into gaps they cannot fit through.
    expect(gridWith(PARTIAL_WALL, 0).isBlockedAt(150, 100)).toBe(false);
    expect(gridWith(PARTIAL_WALL, 40).isBlockedAt(150, 100)).toBe(true);
  });

  it('routes around an obstacle rather than through it', () => {
    const nav = gridWith(PARTIAL_WALL);
    const field = nav.createField();
    nav.computeDistanceField(380, 200, field);

    const steer = { x: 0, y: 0 };
    // Standing left of the wall, aiming for a target directly to the right:
    // the only way through is the gap at the bottom, so the route must have a
    // downward component rather than heading straight at the wall.
    expect(nav.sampleDirection(100, 100, field, steer)).toBe(true);
    expect(steer.y).toBeGreaterThan(0);
  });

  it('leaves sealed-off regions unreachable', () => {
    const nav = gridWith(FULL_WALL);
    const field = nav.createField();
    nav.computeDistanceField(380, 200, field);

    const steer = { x: 0, y: 0 };
    expect(nav.sampleDirection(100, 200, field, steer)).toBe(false);
    expect(steer.x).toBe(0);
    expect(steer.y).toBe(0);
  });

  it('still produces a field when the target stands inside inflated geometry', () => {
    // A target hugging a wall falls inside the inflated region. Without the
    // nearest-open-cell fallback the flood would never start and every bot
    // chasing it would freeze.
    const nav = gridWith(PARTIAL_WALL, 40);
    const field = nav.createField();
    nav.computeDistanceField(200, 100, field);

    const reached = field.some(v => v !== UNREACHABLE);
    expect(reached).toBe(true);
  });

  it('descends toward the target on open ground', () => {
    const nav = gridWith([]);
    const field = nav.createField();
    nav.computeDistanceField(380, 200, field);

    const steer = { x: 0, y: 0 };
    nav.sampleDirection(100, 200, field, steer);
    expect(steer.x).toBeGreaterThan(0.5);
    expect(Math.abs(steer.y)).toBeLessThan(0.5);
  });

  it('returns a unit vector', () => {
    const nav = gridWith([]);
    const field = nav.createField();
    nav.computeDistanceField(380, 380, field);

    const steer = { x: 0, y: 0 };
    nav.sampleDirection(100, 100, field, steer);
    expect(Math.hypot(steer.x, steer.y)).toBeCloseTo(1, 6);
  });
});
