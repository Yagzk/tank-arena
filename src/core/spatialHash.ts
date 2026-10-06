/**
 * Uniform-grid broadphase.
 *
 * The old engine tested every brawler against every wall, every box and every
 * other brawler, and every projectile against every wall, on every tick. With
 * ten brawlers, ~60 static rectangles and a few hundred live projectiles that
 * is tens of thousands of narrow-phase tests per tick, almost all of them
 * between objects on opposite sides of the map.
 *
 * This grid buckets objects by cell so a query only visits the handful of
 * cells the shape actually touches. Results are returned as indices into the
 * caller's own array, and the scratch buffer is reused, so a query allocates
 * nothing.
 */

import type { Rect } from './collision';

export class SpatialHash {
  private readonly cellSize: number;
  private readonly invCellSize: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: number[][];

  /** Scratch buffer reused by every query. */
  private readonly results: number[] = [];
  /** Per-query de-duplication stamps, so an object spanning cells is yielded once. */
  private readonly seen: Int32Array;
  private queryStamp = 0;

  constructor(width: number, height: number, cellSize = 160, capacity = 4096) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.cols = Math.max(1, Math.ceil(width * this.invCellSize));
    this.rows = Math.max(1, Math.ceil(height * this.invCellSize));
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    this.seen = new Int32Array(capacity);
  }

  public clear(): void {
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i].length > 0) this.cells[i].length = 0;
    }
  }

  /** Rebuilds the grid from a list of axis-aligned rectangles. */
  public rebuildFromRects(rects: readonly Rect[]): void {
    this.clear();
    for (let i = 0; i < rects.length; i++) {
      this.insertRect(i, rects[i]);
    }
  }

  public insertRect(index: number, rect: Rect): void {
    const c0 = this.clampCol(rect.x);
    const c1 = this.clampCol(rect.x + rect.w);
    const r0 = this.clampRow(rect.y);
    const r1 = this.clampRow(rect.y + rect.h);

    for (let r = r0; r <= r1; r++) {
      const rowOffset = r * this.cols;
      for (let c = c0; c <= c1; c++) {
        this.cells[rowOffset + c].push(index);
      }
    }
  }

  public insertPoint(index: number, x: number, y: number, radius = 0): void {
    this.insertRect(index, {
      x: x - radius,
      y: y - radius,
      w: radius * 2,
      h: radius * 2,
    });
  }

  /**
   * Indices of everything whose cell overlaps the given box.
   * The returned array is scratch memory — copy it if you need it to survive
   * the next query.
   */
  public queryBox(x: number, y: number, w: number, h: number): readonly number[] {
    this.results.length = 0;
    this.queryStamp++;

    const c0 = this.clampCol(x);
    const c1 = this.clampCol(x + w);
    const r0 = this.clampRow(y);
    const r1 = this.clampRow(y + h);

    for (let r = r0; r <= r1; r++) {
      const rowOffset = r * this.cols;
      for (let c = c0; c <= c1; c++) {
        const bucket = this.cells[rowOffset + c];
        for (let i = 0; i < bucket.length; i++) {
          const index = bucket[i];
          if (index < this.seen.length) {
            if (this.seen[index] === this.queryStamp) continue;
            this.seen[index] = this.queryStamp;
          }
          this.results.push(index);
        }
      }
    }
    return this.results;
  }

  public queryCircle(x: number, y: number, radius: number): readonly number[] {
    return this.queryBox(x - radius, y - radius, radius * 2, radius * 2);
  }

  /**
   * Indices near the swept path of a moving circle. Uses the motion's bounding
   * box, which is conservative but exact enough for a broadphase.
   */
  public querySweep(
    x: number,
    y: number,
    dx: number,
    dy: number,
    radius: number
  ): readonly number[] {
    const minX = Math.min(x, x + dx) - radius;
    const minY = Math.min(y, y + dy) - radius;
    const maxX = Math.max(x, x + dx) + radius;
    const maxY = Math.max(y, y + dy) + radius;
    return this.queryBox(minX, minY, maxX - minX, maxY - minY);
  }

  private clampCol(x: number): number {
    const c = Math.floor(x * this.invCellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private clampRow(y: number): number {
    const r = Math.floor(y * this.invCellSize);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }
}
