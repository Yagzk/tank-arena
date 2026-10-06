/**
 * Navigation grid and flow-field pathfinding.
 *
 * Bots previously had no navigation at all: they took the angle to their
 * target and walked straight at it, so any wall between the two ended the
 * chase — the bot pressed into the corner and stayed there for the rest of the
 * match. This grid gives them an actual route.
 *
 * The approach is a breadth-first distance field rather than per-bot A*:
 * flooding the whole grid from a target costs about the same as one A* query
 * but answers "which way from here?" for every cell at once, and it degrades
 * gracefully when the target moves, which it does constantly.
 */

import type { Rect } from './collision';

/** Marker for cells the flood fill has not reached (walled off or unreachable). */
export const UNREACHABLE = 0x7fffffff;

export class NavGrid {
  public readonly cols: number;
  public readonly rows: number;
  public readonly cellSize: number;

  /** 1 where a body of the inflation radius cannot stand. */
  private readonly blocked: Uint8Array;

  /** Scratch queue for the flood fill, sized to the whole grid. */
  private readonly queue: Int32Array;

  constructor(width: number, height: number, cellSize = 40) {
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.queue = new Int32Array(this.cols * this.rows);
  }

  public get cellCount(): number {
    return this.cols * this.rows;
  }

  /** Allocates a distance-field buffer sized for this grid. */
  public createField(): Int32Array {
    return new Int32Array(this.cols * this.rows);
  }

  /**
   * Rebuilds the occupancy grid.
   *
   * Obstacles are inflated by `agentRadius` so the centre of a body can never
   * be routed into a gap narrower than the body itself — without this, bots
   * path confidently into corners they physically cannot enter.
   */
  public rebuild(blockerGroups: readonly (readonly Rect[])[], agentRadius: number): void {
    this.blocked.fill(0);

    for (const group of blockerGroups) {
      for (let i = 0; i < group.length; i++) {
        const r = group[i];
        const minCol = this.clampCol(Math.floor((r.x - agentRadius) / this.cellSize));
        const maxCol = this.clampCol(Math.floor((r.x + r.w + agentRadius) / this.cellSize));
        const minRow = this.clampRow(Math.floor((r.y - agentRadius) / this.cellSize));
        const maxRow = this.clampRow(Math.floor((r.y + r.h + agentRadius) / this.cellSize));

        for (let row = minRow; row <= maxRow; row++) {
          const offset = row * this.cols;
          for (let col = minCol; col <= maxCol; col++) {
            this.blocked[offset + col] = 1;
          }
        }
      }
    }
  }

  public isBlockedAt(x: number, y: number): boolean {
    const col = this.clampCol(Math.floor(x / this.cellSize));
    const row = this.clampRow(Math.floor(y / this.cellSize));
    return this.blocked[row * this.cols + col] === 1;
  }

  /**
   * Floods `field` with step distances from the cell containing (targetX,
   * targetY). Cells that cannot be reached keep `UNREACHABLE`.
   *
   * Four-way propagation: eight-way would let a path cut diagonally between two
   * blocked cells that touch only at a corner, which bodies cannot do.
   */
  public computeDistanceField(targetX: number, targetY: number, field: Int32Array): void {
    field.fill(UNREACHABLE);

    const startCol = this.clampCol(Math.floor(targetX / this.cellSize));
    const startRow = this.clampRow(Math.floor(targetY / this.cellSize));
    let startIndex = startRow * this.cols + startCol;

    // A target standing inside inflated geometry (hugging a wall, say) would
    // otherwise produce an empty field. Fall back to the nearest open cell.
    if (this.blocked[startIndex] === 1) {
      const fallback = this.findNearestOpen(startCol, startRow);
      if (fallback < 0) return;
      startIndex = fallback;
    }

    const queue = this.queue;
    let head = 0;
    let tail = 0;

    field[startIndex] = 0;
    queue[tail++] = startIndex;

    while (head < tail) {
      const index = queue[head++];
      const d = field[index] + 1;
      const col = index % this.cols;
      const row = (index - col) / this.cols;

      if (col > 0) {
        const n = index - 1;
        if (this.blocked[n] === 0 && field[n] === UNREACHABLE) {
          field[n] = d;
          queue[tail++] = n;
        }
      }
      if (col < this.cols - 1) {
        const n = index + 1;
        if (this.blocked[n] === 0 && field[n] === UNREACHABLE) {
          field[n] = d;
          queue[tail++] = n;
        }
      }
      if (row > 0) {
        const n = index - this.cols;
        if (this.blocked[n] === 0 && field[n] === UNREACHABLE) {
          field[n] = d;
          queue[tail++] = n;
        }
      }
      if (row < this.rows - 1) {
        const n = index + this.cols;
        if (this.blocked[n] === 0 && field[n] === UNREACHABLE) {
          field[n] = d;
          queue[tail++] = n;
        }
      }
    }
  }

  /**
   * Direction of steepest descent on the field at (x, y), written into `out` as
   * a unit vector. Returns false when the body is on an unreachable cell, so
   * the caller can fall back to its own behaviour instead of standing still.
   *
   * Neighbours are sampled eight-way here (unlike the flood, which is four-way)
   * so the resulting motion reads as a smooth diagonal rather than a staircase.
   */
  public sampleDirection(
    x: number,
    y: number,
    field: Int32Array,
    out: { x: number; y: number }
  ): boolean {
    const col = this.clampCol(Math.floor(x / this.cellSize));
    const row = this.clampRow(Math.floor(y / this.cellSize));

    let bestDistance = field[row * this.cols + col];
    let bestCol = col;
    let bestRow = row;
    let found = false;

    for (let dRow = -1; dRow <= 1; dRow++) {
      const nRow = row + dRow;
      if (nRow < 0 || nRow >= this.rows) continue;
      for (let dCol = -1; dCol <= 1; dCol++) {
        if (dCol === 0 && dRow === 0) continue;
        const nCol = col + dCol;
        if (nCol < 0 || nCol >= this.cols) continue;

        const nIndex = nRow * this.cols + nCol;
        if (this.blocked[nIndex] === 1) continue;

        // Refuse a diagonal that squeezes between two blocked orthogonals.
        if (dCol !== 0 && dRow !== 0) {
          if (
            this.blocked[row * this.cols + nCol] === 1 ||
            this.blocked[nRow * this.cols + col] === 1
          ) {
            continue;
          }
        }

        const d = field[nIndex];
        if (d < bestDistance) {
          bestDistance = d;
          bestCol = nCol;
          bestRow = nRow;
          found = true;
        }
      }
    }

    if (!found) {
      out.x = 0;
      out.y = 0;
      return false;
    }

    // Steer toward the centre of the chosen cell rather than along the raw grid
    // axis; it keeps bodies off wall corners as they round them.
    const targetX = (bestCol + 0.5) * this.cellSize;
    const targetY = (bestRow + 0.5) * this.cellSize;
    const dx = targetX - x;
    const dy = targetY - y;
    const len = Math.hypot(dx, dy) || 1;
    out.x = dx / len;
    out.y = dy / len;
    return true;
  }

  /** Breadth-first search for the closest unblocked cell, used as a fallback. */
  private findNearestOpen(col: number, row: number): number {
    for (let radius = 1; radius <= 6; radius++) {
      for (let dRow = -radius; dRow <= radius; dRow++) {
        for (let dCol = -radius; dCol <= radius; dCol++) {
          if (Math.abs(dCol) !== radius && Math.abs(dRow) !== radius) continue;
          const nCol = col + dCol;
          const nRow = row + dRow;
          if (nCol < 0 || nCol >= this.cols || nRow < 0 || nRow >= this.rows) continue;
          const index = nRow * this.cols + nCol;
          if (this.blocked[index] === 0) return index;
        }
      }
    }
    return -1;
  }

  private clampCol(col: number): number {
    return col < 0 ? 0 : col >= this.cols ? this.cols - 1 : col;
  }

  private clampRow(row: number): number {
    return row < 0 ? 0 : row >= this.rows ? this.rows - 1 : row;
  }
}
