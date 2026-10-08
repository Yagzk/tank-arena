/**
 * Client-side prediction of the player's own movement.
 *
 * Without it, pressing a key does nothing on screen until the input has gone to
 * the server, been simulated, come back in a snapshot, and then waited out the
 * interpolation delay. On a 60 ms link that is a quarter of a second between
 * hand and character, and it feels like lag whatever the bandwidth is.
 *
 * Here the client runs its own movement immediately, with the same code the
 * server runs (`sim/movement.ts`), so the character answers the key on the
 * next frame. The server stays in charge: every snapshot says where the body
 * really is and which of our inputs it had received when it made that
 * statement, and we rebuild from that — start at the server's position and
 * replay every input it has not yet seen. If the prediction was right the two
 * agree and nothing visibly happens. If it was wrong (we were knocked back, or
 * walked into someone the client did not know about) the correction is eased in
 * over a few frames instead of being a snap.
 *
 * Only movement is predicted. Shots, damage and everything that touches another
 * player stays server-side, which is why this is safe: the worst a wrong
 * prediction can do is draw your own body a few pixels off for a moment.
 */

import { BRAWLERS, type BrawlerEntity, type BrawlWall, type PowerCubeBox } from '../types/brawl';
import { BRAWLER_RADIUS, integrateMovement, maxSpeedFor, pushOutOfRect } from '../sim/movement';
import { getKit } from '../sim/kits';

interface Held {
  seq: number;
  moveX: number;
  moveY: number;
  at: number;
  /** Milliseconds of this input the server's position already includes. */
  consumedMs: number;
}

interface Sent {
  seq: number;
  moveX: number;
  moveY: number;
  /** How long it was held, in seconds, once the next input replaced it. */
  dt: number;
}

/** An input held longer than this was not really being held — the tab stalled. */
const MAX_HOLD_SECONDS = 0.1;

/** Corrections bigger than this are not drift, they are something that happened. */
const SNAP_DISTANCE = 70;

/** How quickly an eased correction fades, in seconds. */
const CORRECTION_TIME_CONSTANT = 0.08;

export class Predictor {
  private body = { x: 0, y: 0, vx: 0, vy: 0 };
  private active = false;
  private held: Held | null = null;
  private sent: Sent[] = [];

  private walls: BrawlWall[] = [];
  private boxes: PowerCubeBox[] = [];

  private brawlerId = 'mira' as BrawlerEntity['brawlerId'];
  private slowTimer = 0;
  private speedBoostTimer = 0;
  private speedBoostMagnitude = 1;
  private rootTimer = 0;

  /** What is left of the last correction, drawn on top of the body. */
  private offsetX = 0;
  private offsetY = 0;

  /** True while there is a prediction to show. */
  public get isActive(): boolean {
    return this.active;
  }

  public reset(): void {
    this.active = false;
    this.held = null;
    this.sent = [];
    this.offsetX = 0;
    this.offsetY = 0;
  }

  /**
   * The player's input at this instant, which also closes the previous one.
   *
   * An input has an effect for as long as it is held, which is not known until
   * the next one replaces it; so the previous input is stepped here, for the
   * time it was actually held.
   */
  public onLocalInput(seq: number, moveX: number, moveY: number, nowMs: number): void {
    const held = this.held;
    if (held) {
      const seconds = Math.min(MAX_HOLD_SECONDS, Math.max(0, (nowMs - held.at) / 1000));
      this.sent.push({ seq: held.seq, moveX: held.moveX, moveY: held.moveY, dt: seconds });
      // Part of it may already be in the server's position; step only the rest.
      const remaining = Math.max(0, seconds - held.consumedMs / 1000);
      if (this.active) this.step(held.moveX, held.moveY, remaining);
    }
    this.held = { seq, moveX, moveY, at: nowMs, consumedMs: 0 };

    // Never keep more history than a connection could plausibly need.
    if (this.sent.length > 240) this.sent.splice(0, this.sent.length - 240);
  }

  /**
   * Rebuilds the prediction from what the server says about us.
   *
   * `playing` is false in the countdown and after the round: the server does not
   * move anybody then, so neither may we.
   */
  public reconcile(
    me: BrawlerEntity,
    walls: BrawlWall[],
    boxes: PowerCubeBox[],
    playing: boolean
  ): void {
    this.walls = walls;
    this.boxes = boxes;
    this.brawlerId = me.brawlerId;

    // While stunned, airborne or dead the server is moving us by other means,
    // and anything we predicted would be fiction. Follow it exactly.
    const predictable = playing && me.isAlive && me.stunTimer <= 0 && !me.isJumping;
    if (!predictable) {
      this.active = false;
      this.sent = [];
      this.offsetX = 0;
      this.offsetY = 0;
      this.body = { x: me.x, y: me.y, vx: me.vx, vy: me.vy };
      if (this.held) this.held.consumedMs = 0;
      return;
    }

    const shown = this.active ? this.position() : null;

    this.slowTimer = me.slowTimer;
    this.speedBoostTimer = me.speedBoostTimer;
    this.speedBoostMagnitude = me.speedBoostMagnitude;
    this.rootTimer = me.rootTimer;
    this.body = { x: me.x, y: me.y, vx: me.vx, vy: me.vy };
    this.active = true;

    const ack = me.inputAck;
    const ageSeconds = me.inputAckAge / 1000;

    // Inputs the server has fully accounted for are done with.
    this.sent = this.sent.filter(s => s.seq >= ack);

    for (const s of this.sent) {
      if (s.seq === ack) {
        // The server has been applying this one for `age` already; what is left
        // of it is not in the position we were sent.
        this.step(s.moveX, s.moveY, Math.max(0, s.dt - ageSeconds));
      } else {
        this.step(s.moveX, s.moveY, s.dt);
      }
    }

    // The input still being held may be the very one the server last heard, in
    // which case part of it is already in the position above.
    if (this.held) this.held.consumedMs = this.held.seq === ack ? me.inputAckAge : 0;
    // Or it may be newer, in which case the server has not heard it at all.

    if (shown) {
      const dx = shown.x - this.body.x;
      const dy = shown.y - this.body.y;
      if (Math.hypot(dx, dy) < SNAP_DISTANCE) {
        // Keep drawing where the body was and let the difference fade, so a
        // correction is a slide and not a jump.
        this.offsetX = dx;
        this.offsetY = dy;
      } else {
        this.offsetX = 0;
        this.offsetY = 0;
      }
    } else {
      this.offsetX = 0;
      this.offsetY = 0;
    }
  }

  /**
   * Where to draw the player's own body, or null if the server's word stands.
   *
   * Given the time, it includes the input being held at this moment, walked
   * forward on a copy: inputs are sent sixty times a second, but a display may
   * draw a hundred and forty-four, and without this the body would advance in
   * steps of the slower one.
   */
  public position(nowMs?: number): { x: number; y: number } | null {
    if (!this.active) return null;

    let { x, y } = this.body;
    const held = this.held;
    if (nowMs !== undefined && held) {
      const seconds = Math.min(MAX_HOLD_SECONDS, Math.max(0, (nowMs - held.at) / 1000));
      const remaining = Math.max(0, seconds - held.consumedMs / 1000);
      if (remaining > 0) {
        const ahead = { ...this.body };
        this.step(held.moveX, held.moveY, remaining, ahead);
        x = ahead.x;
        y = ahead.y;
      }
    }
    return { x: x + this.offsetX, y: y + this.offsetY };
  }

  /** Lets an eased correction fade. Called once per drawn frame. */
  public advance(frameSeconds: number): void {
    if (this.offsetX === 0 && this.offsetY === 0) return;
    const keep = Math.exp(-Math.max(0, frameSeconds) / CORRECTION_TIME_CONSTANT);
    this.offsetX *= keep;
    this.offsetY *= keep;
    if (Math.abs(this.offsetX) < 0.05) this.offsetX = 0;
    if (Math.abs(this.offsetY) < 0.05) this.offsetY = 0;
  }

  private step(moveX: number, moveY: number, dt: number, body = this.body): void {
    if (dt <= 0) return;
    const cfg = BRAWLERS[this.brawlerId];
    const traits = getKit(this.brawlerId).traits;

    integrateMovement(
      body,
      moveX,
      moveY,
      maxSpeedFor(
        cfg.speed,
        traits?.speedMultiplier ?? 1,
        this.slowTimer,
        this.speedBoostTimer,
        this.speedBoostMagnitude
      ),
      cfg.acceleration,
      this.rootTimer > 0,
      dt,
      horizontal => this.resolve(body, horizontal)
    );

    // The effects that were running when the server last spoke are running
    // down while we replay, so they must not be treated as permanent. Not for
    // a throwaway copy: it must not use up time the real body has yet to see.
    if (body === this.body) {
      this.slowTimer -= dt;
      this.speedBoostTimer -= dt;
      this.rootTimer -= dt;
    }
  }

  private resolve(b: { x: number; y: number; vx: number; vy: number }, horizontal: boolean): void {
    const reach = BRAWLER_RADIUS + 1;
    for (const wall of this.walls) {
      // Cheap rejection first: nearly every wall on the map is nowhere near.
      if (wall.x > b.x + reach || wall.x + wall.w < b.x - reach) continue;
      if (wall.y > b.y + reach || wall.y + wall.h < b.y - reach) continue;
      pushOutOfRect(b, BRAWLER_RADIUS, wall, horizontal);
    }
    for (const box of this.boxes) {
      if (box.x > b.x + reach || box.x + box.w < b.x - reach) continue;
      if (box.y > b.y + reach || box.y + box.h < b.y - reach) continue;
      pushOutOfRect(b, BRAWLER_RADIUS, box, horizontal);
    }
  }
}
