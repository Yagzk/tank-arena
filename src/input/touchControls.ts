/**
 * Twin-stick touch controls modelled on Brawl Stars.
 *
 * The previous implementation fired continuously while the right-hand stick was
 * held, decided which stick a touch belonged to by comparing its *current*
 * position against the screen midpoint, and had no dead zone. That produces
 * three concrete problems: you cannot line up a shot without spraying while you
 * do it, dragging an aim across the middle of the screen silently hijacks the
 * movement stick, and the smallest tremor registers as input.
 *
 * The model here is the one the genre settled on:
 *
 *  - Sticks float: the origin is wherever the finger lands, not a fixed pad.
 *  - A touch belongs to whichever stick claimed it, tracked by touch identifier
 *    for its whole life, so dragging anywhere on screen is safe.
 *  - Dragging the action stick *aims*. Nothing fires until release.
 *  - Releasing without having dragged past the tap threshold is a quick-fire:
 *    the shot goes to the nearest target instead of the stick direction.
 *  - The Super and the gadget work the same way, from their own buttons.
 *
 * This module is pure state: it takes touch events in screen (CSS pixel) space
 * and reports what the player is asking for. It knows nothing about the world.
 */

export type ActionKind = 'attack' | 'super';

/** Radius, in CSS pixels, at which a stick reads as fully deflected. */
const MOVE_STICK_RADIUS = 66;
const ACTION_STICK_RADIUS = 92;

/** Deflection below this is treated as noise. */
const MOVE_DEAD_ZONE = 9;

/**
 * Drag below this on release counts as a tap rather than an aimed shot.
 * Generous on purpose: a thumb never releases perfectly still, and firing in a
 * random direction because of a 6 px wobble is worse than quick-firing.
 */
const TAP_THRESHOLD = 20;

export interface StickState {
  active: boolean;
  /** Where the finger landed. */
  originX: number;
  originY: number;
  /** Where the finger is now. */
  x: number;
  y: number;
  /** Unit direction from origin to current position; zero when centred. */
  dirX: number;
  dirY: number;
  /** Deflection as a fraction of the stick's radius, clamped to 1. */
  magnitude: number;
}

/** Emitted once, on release, for the frame that should act on it. */
export interface ActionPulse {
  kind: ActionKind;
  /**
   * True when the player aimed. False for a tap, which the caller should
   * resolve against the nearest target instead of using `dirX`/`dirY`.
   */
  aimed: boolean;
  dirX: number;
  dirY: number;
  /** Deflection at the moment of release — how far out an area Super lands. */
  magnitude: number;
}

export interface ButtonLayout {
  superX: number;
  superY: number;
  superRadius: number;
  gadgetX: number;
  gadgetY: number;
  gadgetRadius: number;
}

function emptyStick(): StickState {
  return { active: false, originX: 0, originY: 0, x: 0, y: 0, dirX: 0, dirY: 0, magnitude: 0 };
}

function updateStick(stick: StickState, x: number, y: number, radius: number, deadZone: number) {
  stick.x = x;
  stick.y = y;

  const dx = x - stick.originX;
  const dy = y - stick.originY;
  const length = Math.hypot(dx, dy);

  if (length <= deadZone) {
    stick.dirX = 0;
    stick.dirY = 0;
    stick.magnitude = 0;
    return;
  }

  stick.dirX = dx / length;
  stick.dirY = dy / length;
  stick.magnitude = Math.min(1, length / radius);
}

export class TouchControls {
  public readonly move: StickState = emptyStick();
  public readonly action: StickState = emptyStick();

  /** Which action the active aiming stick will perform on release. */
  public actionKind: ActionKind = 'attack';

  private moveTouchId: number | null = null;
  private actionTouchId: number | null = null;
  private gadgetTouchId: number | null = null;

  private pendingPulse: ActionPulse | null = null;
  private pendingGadget = false;

  private layout: ButtonLayout = {
    superX: 0,
    superY: 0,
    superRadius: 46,
    gadgetX: 0,
    gadgetY: 0,
    gadgetRadius: 34,
  };

  /** Recomputes button positions for the current viewport, in CSS pixels. */
  public setViewport(width: number, height: number): void {
    this.layout = {
      superX: width - 96,
      superY: height - 148,
      superRadius: 46,
      gadgetX: width - 186,
      gadgetY: height - 86,
      gadgetRadius: 34,
    };
  }

  public getLayout(): Readonly<ButtonLayout> {
    return this.layout;
  }

  /** True while the player is dragging out a shot and nothing has fired yet. */
  public get isAiming(): boolean {
    return this.action.active;
  }

  public onTouchStart(id: number, x: number, y: number, viewWidth: number): void {
    const l = this.layout;

    // Buttons take priority over the open area they sit on.
    if (this.gadgetTouchId === null && Math.hypot(x - l.gadgetX, y - l.gadgetY) <= l.gadgetRadius) {
      this.gadgetTouchId = id;
      return;
    }

    if (this.actionTouchId === null && Math.hypot(x - l.superX, y - l.superY) <= l.superRadius) {
      this.actionTouchId = id;
      this.actionKind = 'super';
      this.action.active = true;
      // The Super aims from the button itself, so a small drag already reads as
      // a deliberate direction.
      this.action.originX = l.superX;
      this.action.originY = l.superY;
      updateStick(this.action, x, y, ACTION_STICK_RADIUS, 0);
      return;
    }

    if (x < viewWidth / 2) {
      if (this.moveTouchId !== null) return;
      this.moveTouchId = id;
      this.move.active = true;
      this.move.originX = x;
      this.move.originY = y;
      updateStick(this.move, x, y, MOVE_STICK_RADIUS, MOVE_DEAD_ZONE);
      return;
    }

    if (this.actionTouchId !== null) return;
    this.actionTouchId = id;
    this.actionKind = 'attack';
    this.action.active = true;
    this.action.originX = x;
    this.action.originY = y;
    updateStick(this.action, x, y, ACTION_STICK_RADIUS, 0);
  }

  public onTouchMove(id: number, x: number, y: number): void {
    // A touch stays with the stick that claimed it, wherever it travels. The
    // old position-based routing let an aim drag across the midpoint steal the
    // movement stick mid-fight.
    if (id === this.moveTouchId) {
      updateStick(this.move, x, y, MOVE_STICK_RADIUS, MOVE_DEAD_ZONE);
    } else if (id === this.actionTouchId) {
      updateStick(this.action, x, y, ACTION_STICK_RADIUS, 0);
    }
  }

  public onTouchEnd(id: number, x: number, y: number): void {
    if (id === this.moveTouchId) {
      this.moveTouchId = null;
      this.move.active = false;
      this.move.dirX = 0;
      this.move.dirY = 0;
      this.move.magnitude = 0;
      return;
    }

    if (id === this.gadgetTouchId) {
      this.gadgetTouchId = null;
      const l = this.layout;
      // Only counts if the finger is still on the button — sliding off is the
      // conventional way to back out of a press.
      if (Math.hypot(x - l.gadgetX, y - l.gadgetY) <= l.gadgetRadius * 1.4) {
        this.pendingGadget = true;
      }
      return;
    }

    if (id !== this.actionTouchId) return;

    this.actionTouchId = null;
    this.action.active = false;

    const dragged = Math.hypot(this.action.x - this.action.originX, this.action.y - this.action.originY);

    this.pendingPulse = {
      kind: this.actionKind,
      aimed: dragged >= TAP_THRESHOLD,
      dirX: this.action.dirX,
      dirY: this.action.dirY,
      magnitude: this.action.magnitude,
    };

    this.action.dirX = 0;
    this.action.dirY = 0;
    this.action.magnitude = 0;
  }

  /** Clears every stick, for when the match ends or the view is torn down. */
  public reset(): void {
    this.moveTouchId = null;
    this.actionTouchId = null;
    this.gadgetTouchId = null;
    this.pendingPulse = null;
    this.pendingGadget = false;
    Object.assign(this.move, emptyStick());
    Object.assign(this.action, emptyStick());
  }

  /** Returns the pending shot exactly once. */
  public consumePulse(): ActionPulse | null {
    const pulse = this.pendingPulse;
    this.pendingPulse = null;
    return pulse;
  }

  /** Returns true exactly once per gadget press. */
  public consumeGadget(): boolean {
    const pressed = this.pendingGadget;
    this.pendingGadget = false;
    return pressed;
  }
}
