/**
 * Which way the player is actually driving the game right now.
 *
 * Checking `'ontouchstart' in window || navigator.maxTouchPoints > 0` is the
 * usual shorthand and it is wrong for a large and growing share of machines:
 * every touchscreen Windows laptop reports touch support while the player sits
 * there with a mouse. Those players would get the phone layout — on-screen
 * sticks they cannot use, and no desktop HUD.
 *
 * So the mode is a live property, not a device capability:
 *
 *  - It starts from `(pointer: coarse)`, which asks whether the *primary*
 *    pointer is imprecise rather than whether a touchscreen exists.
 *  - It then follows actual input: a real touch switches to touch, and moving a
 *    mouse or pressing a key switches back.
 *
 * A hybrid device therefore shows the right controls for whatever the player
 * just picked up, and changes as soon as they switch.
 */

export type InputMode = 'pointer' | 'touch';

type Listener = (mode: InputMode) => void;

const listeners = new Set<Listener>();
let current: InputMode = detectInitialMode();
let installed = false;

function detectInitialMode(): InputMode {
  if (typeof window === 'undefined') return 'pointer';
  if (typeof window.matchMedia === 'function') {
    // Coarse primary pointer: a finger or stylus is the main way in.
    if (window.matchMedia('(pointer: coarse)').matches) return 'touch';
    if (window.matchMedia('(pointer: fine)').matches) return 'pointer';
  }
  return navigator.maxTouchPoints > 0 ? 'touch' : 'pointer';
}

function setMode(mode: InputMode): void {
  if (mode === current) return;
  current = mode;
  for (const listener of listeners) listener(mode);
}

function install(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('touchstart', () => setMode('touch'), { passive: true, capture: true });

  // `pointermove` from a touch also fires, so filter on the pointer type. A
  // mouse that merely exists proves nothing; a mouse that moves proves the
  // player is using it.
  window.addEventListener(
    'pointermove',
    event => {
      if (event.pointerType === 'mouse') setMode('pointer');
    },
    { passive: true, capture: true }
  );

  window.addEventListener('keydown', () => setMode('pointer'), { capture: true });
}

/** The current input mode. */
export function getInputMode(): InputMode {
  install();
  return current;
}

/** Subscribes to mode changes. Returns an unsubscribe function. */
export function onInputModeChange(listener: Listener): () => void {
  install();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
