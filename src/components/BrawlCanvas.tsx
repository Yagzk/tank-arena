import React, { useEffect, useRef, useState } from 'react';
import {
  BrawlSnapshot,
  BrawlPlayerInput,
  BrawlerEntity,
  BRAWLERS,
  BrawlerId,
  DeployedEntity,
} from '../types/brawl';
import { MAP_WIDTH, MAP_HEIGHT } from '../maps';
import {
  drawCharacter,
  drawCharacterShadow,
  drawGem,
  drawPowerCube,
} from '../render/characterArt';
import { CHARACTER_STYLES } from '../render/characterStyles';
import { SnapshotInterpolator } from '../net/interpolation';
import type { Predictor } from '../net/prediction';
import { TouchControls } from '../input/touchControls';
import { getInputMode, onInputModeChange } from '../input/inputMode';
import { profiler } from '../core/profiler';
import { clamp } from '../core/math';
import { hasArmedPassive } from '../sim/kitInfo';
import { brawlAudio } from '../audio/brawlAudio';

/**
 * How much of the world the camera should cover, in world units.
 *
 * The canvas used to draw the world at 1:1 with no zoom, so a 1920-wide
 * monitor saw 1920 world units and a phone saw 375 — the desktop player had
 * five times the field of view, and brawlers were 62 px tall on a 1080p
 * screen. Zoom is now derived from the viewport area so every device sees a
 * comparable slice of the arena at a readable size.
 */
const DESIGN_VIEW_LANDSCAPE = { w: 1280, h: 720 };
const DESIGN_VIEW_PORTRAIT = { w: 640, h: 1100 };

/**
 * Deterministic value noise in [0, 1) from a pair of coordinates.
 *
 * Decoration needs to look random but must not change between frames, or it
 * crawls. A hash of the position gives both.
 */
function hash2(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/** How long a body stays lit after taking a hit. */
const HIT_FLASH_SECONDS = 0.11;

/** A character drawn entirely in white, for the hit flash. */
const HIT_FLASH_STYLE = {
  primary: '#ffffff',
  secondary: '#ffffff',
  accent: '#ffffff',
  skin: '#ffffff',
  hair: '#ffffff',
  build: 'medium',
  weapon: 'scattergun',
  headgear: 'hood',
} as const;

/** How long the kill announcement stays up, in milliseconds. */
const KILL_BANNER_MS = 1500;

/** Seconds the edge marker stays up after you are hit. */
const DAMAGE_MARKER_SECONDS = 1.1;

interface ViewMetrics {
  /** Viewport size in CSS pixels. */
  w: number;
  h: number;
  /** Backing-store scale, so the canvas is crisp on high-density screens. */
  dpr: number;
  /** World-units-to-CSS-pixels factor. */
  zoom: number;
  /** Visible world extent, derived from the above. */
  worldW: number;
  worldH: number;
}

interface BrawlCanvasProps {
  snapshot: BrawlSnapshot | null;
  myPlayerId: string;
  onSendInput: (input: BrawlPlayerInput) => void;
  /**
   * Runs this player's own movement ahead of the server's word. Absent when the
   * body is simulated locally — a host or a solo game — and there is nothing
   * to predict.
   */
  predictor?: Predictor | null;
  /**
   * Pulls the live simulation state. The canvas draws every frame, but React
   * only re-renders the HUD a few times a second, so the renderer reads the
   * engine directly instead of waiting for a prop update.
   */
  getSnapshot?: () => BrawlSnapshot | null;
}

export const BrawlCanvas: React.FC<BrawlCanvasProps> = ({
  snapshot,
  myPlayerId,
  onSendInput,
  predictor = null,
  getSnapshot,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Smooth Camera Coordinates & Screen Shake
  const cameraRef = useRef<{ x: number; y: number }>({ x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 });
  const screenShakeRef = useRef<{ intensity: number; timer: number }>({ intensity: 0, timer: 0 });
  /** Kills the local player had last frame, to notice a new one. */
  const myKillsRef = useRef(0);
  /** The whole second the countdown last showed, for ticking once per second. */
  const lastCountdownRef = useRef(0);
  /** When the last kill you got happened, in ms, and what to say about it. */
  const killFlashRef = useRef<{ at: number; text: string } | null>(null);

  // Super Aiming Mode Toggle (Space / Right-Click / Touch Super Button)
  const isSuperAimingRef = useRef<boolean>(false);

  // Input state
  const keysRef = useRef<Record<string, boolean>>({});
  const mouseRef = useRef<{
    worldX: number;
    worldY: number;
    screenX: number;
    screenY: number;
    isDown: boolean;
    rightDown: boolean;
  }>({
    worldX: MAP_WIDTH / 2,
    worldY: MAP_HEIGHT / 2,
    screenX: 0,
    screenY: 0,
    isDown: false,
    rightDown: false,
  });

  // Mobile Touch Joysticks State
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(false);
  /**
   * Twin-stick touch input. Aiming and firing are separate: dragging lines up a
   * shot and releasing takes it, the way the genre expects on a phone.
   */
  const touchRef = useRef<TouchControls>(new TouchControls());

  /** Remembers the last committed facing so the body does not snap back to a
   *  default heading between shots. */
  const lastAimAngleRef = useRef<number>(0);

  /** Previous-frame values, for detecting the moments worth a haptic pulse. */
  const hapticStateRef = useRef<{ hp: number; superReady: boolean }>({
    hp: Infinity,
    superReady: false,
  });

  /**
   * Who the camera is following. Normally you; once you are out it holds on
   * someone still playing, because watching a corpse until the match ends is
   * not a spectator mode.
   */
  const spectateIdRef = useRef<string | null>(null);

  /** Diagnostics overlay, toggled with F3. */
  const showDiagnosticsRef = useRef<boolean>(false);
  const lastFrameAtRef = useRef<number>(performance.now());

  /** Mirrors the touch-device flag for the input loop, whose effect runs once
   *  and would otherwise close over the initial value forever. */
  const isTouchDeviceRef = useRef<boolean>(false);

  // Stable references
  const snapshotRef = useRef<BrawlSnapshot | null>(snapshot);
  snapshotRef.current = snapshot;
  const myPlayerIdRef = useRef<string>(myPlayerId);
  myPlayerIdRef.current = myPlayerId;
  const predictorRef = useRef<Predictor | null>(predictor);
  predictorRef.current = predictor;
  const onSendInputRef = useRef<(input: BrawlPlayerInput) => void>(onSendInput);
  onSendInputRef.current = onSendInput;
  const getSnapshotRef = useRef<(() => BrawlSnapshot | null) | undefined>(getSnapshot);
  getSnapshotRef.current = getSnapshot;

  /**
   * Network clients receive state at the host's broadcast rate and would
   * otherwise redraw each packet as it lands, so every body jumps forward and
   * then freezes. Buffering and rendering slightly in the past turns that into
   * continuous motion. The host has its own simulation and skips this entirely.
   */
  const interpolatorRef = useRef<SnapshotInterpolator>(new SnapshotInterpolator());
  if (!getSnapshot && snapshot) {
    interpolatorRef.current.push(snapshot, performance.now());
  }

  /**
   * World-space bounds of what the camera can currently see, with a margin so
   * nothing pops in at the edge. Every draw pass tests against this before
   * doing any work: the arena is 2400x1800 and the camera shows roughly a
   * fifth of it, so most of the level was being drawn off screen every frame.
   */
  const cullRef = useRef({ minX: -1e9, minY: -1e9, maxX: 1e9, maxY: 1e9 });

  const inView = (x: number, y: number, w = 0, h = 0): boolean => {
    const c = cullRef.current;
    return x + w >= c.minX && x <= c.maxX && y + h >= c.minY && y <= c.maxY;
  };

  const viewRef = useRef<ViewMetrics>({
    w: 1,
    h: 1,
    dpr: 1,
    zoom: 1,
    worldW: 1,
    worldH: 1,
  });

  // Follows how the player is actually driving the game, so a touchscreen
  // laptop used with a mouse keeps the desktop controls and switches the
  // moment a finger touches the screen.
  useEffect(() => {
    const apply = (mode: 'pointer' | 'touch') => {
      const touch = mode === 'touch';
      isTouchDeviceRef.current = touch;
      setIsTouchDevice(touch);
      if (!touch) touchRef.current.reset();
    };
    apply(getInputMode());
    return onInputModeChange(apply);
  }, []);

  // Window Resize Handling for Crisp Canvas DPI
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const cssW = container.clientWidth || window.innerWidth;
      const cssH = container.clientHeight || window.innerHeight;

      // Cap the backing store at 2x: beyond that the extra pixels cost more
      // than they show.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      const design = cssW >= cssH ? DESIGN_VIEW_LANDSCAPE : DESIGN_VIEW_PORTRAIT;
      // Area-based so ultrawide and tall phones both land somewhere sensible.
      const zoom = clamp(Math.sqrt((cssW * cssH) / (design.w * design.h)), 0.75, 2.2);

      touchRef.current.setViewport(cssW, cssH);

      viewRef.current = {
        w: cssW,
        h: cssH,
        dpr,
        zoom,
        worldW: cssW / zoom,
        worldH: cssH / zoom,
      };
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard & Mouse Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code) keysRef.current[e.code.toLowerCase()] = true;
      if (e.key) keysRef.current[e.key.toLowerCase()] = true;

      if (e.code === 'F3') {
        e.preventDefault();
        showDiagnosticsRef.current = !showDiagnosticsRef.current;
      }

      // Space key toggles Super Aiming Mode
      if (e.code === 'Space' || e.key === ' ') {
        const snap = snapshotRef.current;
        const myBrawler = snap?.brawlers.find(b => b.id === myPlayerIdRef.current);
        if (myBrawler && myBrawler.superCharge >= 100) {
          isSuperAimingRef.current = !isSuperAimingRef.current;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code) keysRef.current[e.code.toLowerCase()] = false;
      if (e.key) keysRef.current[e.key.toLowerCase()] = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      mouseRef.current.screenX = sx;
      mouseRef.current.screenY = sy;

      // Calculate world coordinates through camera transform
      const cam = cameraRef.current;
      const view = viewRef.current;
      mouseRef.current.worldX = (sx - view.w / 2) / view.zoom + cam.x;
      mouseRef.current.worldY = (sy - view.h / 2) / view.zoom + cam.y;
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        mouseRef.current.isDown = true;
      }
      if (e.button === 2) {
        e.preventDefault();
        mouseRef.current.rightDown = true;
        // Right Click toggles Super Aiming Mode
        const snap = snapshotRef.current;
        const myBrawler = snap?.brawlers.find(b => b.id === myPlayerIdRef.current);
        if (myBrawler && myBrawler.superCharge >= 100) {
          isSuperAimingRef.current = !isSuperAimingRef.current;
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) mouseRef.current.isDown = false;
      if (e.button === 2) mouseRef.current.rightDown = false;
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);

    // 60 FPS Input Tick
    const inputInterval = setInterval(() => {
      const keys = keysRef.current;
      const snap = snapshotRef.current;
      const myId = myPlayerIdRef.current;
      const heldBrawler = snap?.brawlers.find(b => b.id === myId);
      // Aim is measured from where the body is *drawn*. The React snapshot is a
      // twelve-a-second copy, and the server's position is a round trip old;
      // aiming from either points the shot at where you were.
      const predictedAt = predictorRef.current?.position(performance.now());
      const myBrawler =
        heldBrawler && predictedAt ? { ...heldBrawler, x: predictedAt.x, y: predictedAt.y } : heldBrawler;

      // Desktop WASD movement
      let moveX = 0;
      let moveY = 0;
      if (keys['keyw'] || keys['w'] || keys['arrowup']) moveY -= 1;
      if (keys['keys'] || keys['s'] || keys['arrowdown']) moveY += 1;
      if (keys['keya'] || keys['a'] || keys['arrowleft']) moveX -= 1;
      if (keys['keyd'] || keys['d'] || keys['arrowright']) moveX += 1;

      const touch = touchRef.current;

      // Touch movement overrides the keyboard. Magnitude is carried through
      // rather than normalised away, so a half-deflected stick walks.
      if (touch.move.magnitude > 0) {
        moveX = touch.move.dirX * touch.move.magnitude;
        moveY = touch.move.dirY * touch.move.magnitude;
      }

      let aimAngle = lastAimAngleRef.current;
      let isSuperAttack = false;
      let isNormalAttack = false;

      if (myBrawler) {
        const cfg = BRAWLERS[myBrawler.brawlerId] ?? BRAWLERS.mira;

        /** Nearest enemy a quick-fire should snap to, if any is close enough. */
        const autoAimTarget = () => {
          let best: BrawlerEntity | null = null;
          let bestDist = cfg.range * 1.35;
          for (const other of snap?.brawlers ?? []) {
            if (other.id === myId || !other.isAlive || other.isClone) continue;
            if (snap?.mode === 'gem_grab' && other.team === myBrawler.team) continue;
            if (other.invisibilityTimer > 0) continue;
            if (other.isInBush && !other.isVisibleToEnemies) continue;
            const d = Math.hypot(other.x - myBrawler.x, other.y - myBrawler.y);
            if (d < bestDist) {
              bestDist = d;
              best = other;
            }
          }
          return best;
        };

        if (touch.isAiming && touch.action.magnitude > 0) {
          // Aiming with a stick: face the stick, and project the Super's
          // landing point out along it by how far the stick is pushed.
          aimAngle = Math.atan2(touch.action.dirY, touch.action.dirX);
          const reach = cfg.range * (0.35 + touch.action.magnitude * 0.65);
          mouseRef.current.worldX = myBrawler.x + touch.action.dirX * reach;
          mouseRef.current.worldY = myBrawler.y + touch.action.dirY * reach;
        } else if (!isTouchDeviceRef.current) {
          aimAngle = Math.atan2(
            mouseRef.current.worldY - myBrawler.y,
            mouseRef.current.worldX - myBrawler.x
          );
        }

        const pulse = touch.consumePulse();
        if (pulse) {
          if (pulse.aimed) {
            aimAngle = Math.atan2(pulse.dirY, pulse.dirX);
            const reach = cfg.range * (0.35 + pulse.magnitude * 0.65);
            mouseRef.current.worldX = myBrawler.x + pulse.dirX * reach;
            mouseRef.current.worldY = myBrawler.y + pulse.dirY * reach;
          } else {
            // A tap is a quick-fire: send it at whoever is closest rather than
            // wherever the thumb happened to be.
            const target = autoAimTarget();
            if (target) {
              aimAngle = Math.atan2(target.y - myBrawler.y, target.x - myBrawler.x);
              mouseRef.current.worldX = target.x;
              mouseRef.current.worldY = target.y;
            }
          }

          if (pulse.kind === 'super') {
            if (myBrawler.superCharge >= 100) isSuperAttack = true;
          } else {
            isNormalAttack = true;
          }
        }

        // Desktop: hold to fire, Space / right-click arms the Super.
        if (!isTouchDeviceRef.current) {
          if (isSuperAimingRef.current && mouseRef.current.isDown) {
            if (myBrawler.superCharge >= 100) {
              isSuperAttack = true;
              isSuperAimingRef.current = false;
            }
          } else if (mouseRef.current.isDown) {
            isNormalAttack = true;
          }
        }

        lastAimAngleRef.current = aimAngle;
      }

      const isGadget = !!(keys['keye'] || keys['e']) || touch.consumeGadget();

      const input: BrawlPlayerInput = {
        moveX,
        moveY,
        aimAngle,
        attack: isNormalAttack,
        superAttack: isSuperAttack,
        gadget: isGadget,
        superTargetX: mouseRef.current.worldX,
        superTargetY: mouseRef.current.worldY,
        emote: keys['keyq'] || keys['q'] ? '👑' : undefined,
      };

      onSendInputRef.current?.(input);
    }, 1000 / 60);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
      clearInterval(inputInterval);
    };
  }, []);

  // Main Render Loop (60 FPS)
  useEffect(() => {
    let animId: number;

    const render = () => {
      const now = performance.now();
      const frameMs = now - lastFrameAtRef.current;
      profiler.frame.push(frameMs);
      lastFrameAtRef.current = now;
      profiler.render.begin();

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Prefer the live engine state; fall back to the prop for network
      // clients, which only ever receive snapshots.
      const rawSnap =
        getSnapshotRef.current?.() ??
        interpolatorRef.current.sample(performance.now()) ??
        snapshotRef.current;
      const myId = myPlayerIdRef.current;

      // Draw our own body where we predict it is, not where the server last said
      // it was, and aim it at the mouse this frame rather than a round trip ago.
      // Everyone else is drawn from the server's account, as before.
      let snap = rawSnap;
      const predictor = predictorRef.current;
      if (rawSnap && predictor) {
        predictor.advance(frameMs / 1000);
        const p = predictor.position(now);
        if (p) {
          snap = {
            ...rawSnap,
            brawlers: rawSnap.brawlers.map(b =>
              b.id === myId ? { ...b, x: p.x, y: p.y, aimAngle: lastAimAngleRef.current } : b
            ),
          };
        }
      }
      const myBrawler = snap?.brawlers.find(b => b.id === myId);

      // Sounds are placed relative to where the player is.
      if (myBrawler) brawlAudio.setListener(myBrawler.x, myBrawler.y);

      // The countdown is heard as well as seen: a tick a second, a word at the
      // start, and a go.
      if (snap) {
        const whole = snap.introCountdown > 0 ? Math.ceil(snap.introCountdown) : 0;
        if (whole !== lastCountdownRef.current) {
          if (whole > 0) {
            if (lastCountdownRef.current === 0) {
              brawlAudio.speak(snap.mode === 'showdown' ? 'Hesaplaşma!' : 'Elmas kapmaca!');
            }
            brawlAudio.play({ type: 'countdown_tick' });
          } else {
            brawlAudio.play({ type: 'countdown_go' });
            brawlAudio.speak('Başla!');
          }
          lastCountdownRef.current = whole;
        }
      }

      // Smooth Camera tracking
      // Pick a camera subject: you while you are alive, otherwise someone who
      // still is. The previous choice is kept while it remains valid so the
      // view does not hop between players every frame.
      let focus = myBrawler;
      if (snap && (!myBrawler || !myBrawler.isAlive)) {
        const held = snap.brawlers.find(
          b => b.id === spectateIdRef.current && b.isAlive && !b.isClone
        );
        focus = held ?? snap.brawlers.find(b => b.isAlive && !b.isClone && b.id !== myId);
        spectateIdRef.current = focus?.id ?? null;
      } else {
        spectateIdRef.current = null;
      }

      const view = viewRef.current;
      if (focus) {
        // Clamp against the visible world extent, not the pixel size of the
        // canvas, so the edge of the arena lines up at any zoom level.
        const halfW = Math.min(view.worldW / 2, MAP_WIDTH / 2);
        const halfH = Math.min(view.worldH / 2, MAP_HEIGHT / 2);
        // On a phone the bottom of the screen is thumbs and buttons, so the
        // camera sits a little low and leaves the character above that band.
        const controlBias = isTouchDeviceRef.current ? view.worldH * 0.1 : 0;
        const targetX = clamp(focus.x, halfW, MAP_WIDTH - halfW);
        const targetY = clamp(focus.y + controlBias, halfH, MAP_HEIGHT - halfH);
        cameraRef.current.x += (targetX - cameraRef.current.x) * 0.12;
        cameraRef.current.y += (targetY - cameraRef.current.y) * 0.12;
      }

      // Haptics. A phone can tell you that you are being hit without you
      // having to read a health bar, which is most of why mobile combat reads
      // so clearly. A harmless no-op where the API is absent.
      if (myBrawler && isTouchDeviceRef.current && typeof navigator.vibrate === 'function') {
        const haptic = hapticStateRef.current;
        if (myBrawler.hp < haptic.hp - 1) {
          navigator.vibrate(18);
        }
        const superReady = myBrawler.superCharge >= 100;
        if (superReady && !haptic.superReady) {
          navigator.vibrate([30, 40, 30]);
        }
        haptic.hp = myBrawler.hp;
        haptic.superReady = superReady;
      }

      // Screen Shake calculation
      let shakeX = 0;
      let shakeY = 0;
      if (screenShakeRef.current.timer > 0) {
        screenShakeRef.current.timer -= 1 / 60;
        const sInt = screenShakeRef.current.intensity;
        shakeX = (Math.random() - 0.5) * sInt;
        shakeY = (Math.random() - 0.5) * sInt;
      }

      const cam = cameraRef.current;

      const cullMargin = 90;
      cullRef.current = {
        minX: cam.x - view.worldW / 2 - cullMargin,
        minY: cam.y - view.worldH / 2 - cullMargin,
        maxX: cam.x + view.worldW / 2 + cullMargin,
        maxY: cam.y + view.worldH / 2 + cullMargin,
      };

      // 1. CLEAR & SAVE WORLD MATRIX
      // Everything below works in CSS pixels; the device-pixel-ratio scale is
      // applied once here so drawing code never has to know about it.
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.clearRect(0, 0, view.w, view.h);
      ctx.save();
      ctx.translate(view.w / 2, view.h / 2);
      ctx.scale(view.zoom, view.zoom);
      ctx.translate(-cam.x + shakeX, -cam.y + shakeY);

      // 2. DRAW GROUND & TILES
      drawGroundTiles(ctx);

      if (snap) {
        // Trigger screen shake on recent high-impact visual effects
        if (snap.visualEffects && snap.visualEffects.length > 0) {
          // Shake strength follows the effect that caused it. Every effect used
          // to produce the same jolt, so a pistol round shook the camera as hard
          // as El Primo landing on it.
          let strongest = 0;
          for (const fx of snap.visualEffects) {
            if (fx.progress > 0.12) continue;
            const weight =
              fx.type === 'hit_spark' || fx.type === 'muzzle_flash'
                ? (fx.intensity ?? 0.3) * 2.2
                : 9;
            if (weight > strongest) strongest = weight;
          }
          if (strongest > screenShakeRef.current.intensity || screenShakeRef.current.timer <= 0) {
            if (strongest > 0) {
              screenShakeRef.current = {
                intensity: strongest,
                timer: strongest > 5 ? 0.22 : 0.09,
              };
            }
          }
        }

        // 3. DRAW BUSHES (Background layer)
        drawBushes(ctx, snap.bushes);

        // 4. DRAW THORN FIELDS (Spike Super)
        drawThornFields(ctx, snap.thornFields);

        // 5. DRAW FIRE PATCHES (Brock Attack & Super Incendiary pools)
        if (snap.firePatches) {
          drawFirePatches(ctx, snap.firePatches);
        }

        // 6. DRAW GEM MINE (Gem Grab)
        if (snap.gemMine) {
          drawGemMine(ctx, snap.gemMine);
        }

        // 7. DRAW POWER CUBE BOXES
        drawBoxes(ctx, snap.boxes);

        // 8. DRAW DROPPED GEMS & CUBES
        drawPickups(ctx, snap.gems, snap.powerCubes);

        // 9. DRAW WALLS
        drawWalls(ctx, snap.walls);

        // 9b. DRAW DEPLOYABLES (turrets, mines, stations, barriers)
        //     Under the brawlers on purpose: a body standing on a mine must
        //     not be hidden by it.
        (snap.deployables ?? []).forEach(d => {
          if (!inView(d.x - 48, d.y - 48, 96, 96)) return;
          drawDeployable(ctx, d, performance.now() * 0.001);
        });

        // 10. DRAW BRAWLERS
        snap.brawlers.forEach(b => {
          if (!inView(b.x - 60, b.y - 60, 120, 120)) return;
          drawBrawler(ctx, b, b.id === myId, myBrawler);
        });

        // 11. DRAW PROJECTILES
        snap.projectiles.forEach(p => {
          if (!inView(p.x - 24, p.y - 24, 48, 48)) return;
          drawProjectile(ctx, p);
        });

        // 12. DRAW VISUAL EFFECTS & SHOCKWAVES
        if (snap.visualEffects) {
          drawVisualEffects(ctx, snap.visualEffects);
        }

        // 13. DRAW POISON GAS (Showdown)
        if (snap.poisonGas?.isActive) {
          drawPoisonGas(ctx, snap.poisonGas.inset);
        }

        // 14. DRAW AIM RETICLE (Normal or Golden Super Aiming Mode)
        if (myBrawler && myBrawler.isAlive) {
          drawAimReticle(ctx, myBrawler, isSuperAimingRef.current);
        }

        // 15. DRAW FLOATING DAMAGE & HEALING NUMBERS
        drawFloatingNumbers(ctx, snap.floatingNumbers);
      }

      ctx.restore(); // Restore world translation

      // Feedback that lives on the screen rather than in the world.
      if (snap && myBrawler) {
        // A kill is the one thing in a fight that deserves to be announced.
        if (myBrawler.kills > myKillsRef.current && myKillsRef.current >= 0) {
          const mine = [...snap.killFeed].reverse().find(k => k.killerName === myBrawler.name);
          killFlashRef.current = {
            at: performance.now(),
            text: mine ? mine.victimName + ' ELENDİ' : 'ELENDİ',
          };
          // The shake that goes with it: a kill should be felt, not just read.
          screenShakeRef.current = { intensity: 7, timer: 0.18 };
        }
        myKillsRef.current = myBrawler.kills;

        drawEdgeIndicators(ctx, view, cam, snap, myBrawler);
        if (killFlashRef.current) {
          const age = performance.now() - killFlashRef.current.at;
          if (age < KILL_BANNER_MS) drawKillBanner(ctx, view, killFlashRef.current.text, age);
          else killFlashRef.current = null;
        }
      }

      // 16. MOBILE ON-SCREEN CONTROLS (Screen space overlay)
      if (isTouchDevice) {
        drawMobileTouchControls(
          ctx,
          view.w,
          view.h,
          snap?.brawlers.find(b => b.id === myId),
          isSuperAimingRef.current
        );
      }

      if (snap) {
        profiler.setCount('brawlers', snap.brawlers.length);
        profiler.setCount('projectiles', snap.projectiles.length);
        profiler.setCount('effects', snap.visualEffects?.length ?? 0);
        profiler.setCount('walls', snap.walls.length);
      }

      if (snap && snap.introCountdown > 0) {
        drawIntroCountdown(ctx, view, snap.introCountdown, snap.mapName);
      } else if (myBrawler && !myBrawler.isAlive) {
        drawDeathOverlay(ctx, view, myBrawler.respawnTimer, spectateIdRef.current, snap);
      }

      profiler.render.end();

      if (showDiagnosticsRef.current) {
        drawDiagnostics(ctx, view);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isTouchDevice]);

  // Authentic Nova Arena Desert / Arena Ground Tiles
  const drawGroundTiles = (ctx: CanvasRenderingContext2D) => {
    // Rich desert stone floor
    ctx.fillStyle = '#1c192b';
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Subtle checkered arena grid
    const tileSize = 60;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    for (let x = 0; x < MAP_WIDTH; x += tileSize * 2) {
      for (let y = 0; y < MAP_HEIGHT; y += tileSize * 2) {
        ctx.fillRect(x, y, tileSize, tileSize);
        ctx.fillRect(x + tileSize, y + tileSize, tileSize, tileSize);
      }
    }

    // Secondary decorative grid lines
    ctx.strokeStyle = 'rgba(147, 51, 234, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= MAP_WIDTH; x += tileSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, MAP_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= MAP_HEIGHT; y += tileSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(MAP_WIDTH, y);
      ctx.stroke();
    }

    // Outer Danger Border Hazard Stripes
    const borderThickness = 30;
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(0, 0, MAP_WIDTH, borderThickness);
    ctx.fillRect(0, MAP_HEIGHT - borderThickness, MAP_WIDTH, borderThickness);
    ctx.fillRect(0, 0, borderThickness, MAP_HEIGHT);
    ctx.fillRect(MAP_WIDTH - borderThickness, 0, borderThickness, MAP_HEIGHT);

    // Hazard warning diagonal stripes
    ctx.save();
    ctx.fillStyle = '#f59e0b';
    const stripeW = 20;
    for (let x = 0; x < MAP_WIDTH; x += stripeW * 2) {
      ctx.fillRect(x, 0, stripeW, borderThickness);
      ctx.fillRect(x, MAP_HEIGHT - borderThickness, stripeW, borderThickness);
    }
    for (let y = 0; y < MAP_HEIGHT; y += stripeW * 2) {
      ctx.fillRect(0, y, borderThickness, stripeW);
      ctx.fillRect(MAP_WIDTH - borderThickness, y, borderThickness, stripeW);
    }
    ctx.restore();
  };

  // Authentic Layered Leafy Bushes (Nova Arena Tall Grass)
  const drawBushes = (ctx: CanvasRenderingContext2D, bushes: any[]) => {
    const time = performance.now() * 0.003;

    bushes.forEach(b => {
      if (!inView(b.x, b.y, b.w, b.h)) return;
      ctx.save();

      // Drop shadow, rounded: a bush is foliage, and a hard-cornered
      // rectangle of shadow under it gives the game away immediately.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.roundRect(b.x + 3, b.y + 6, b.w, b.h, 18);
      ctx.fill();

      // Base deep shade, so gaps between the puffs read as depth rather than
      // as holes in the cluster.
      ctx.fillStyle = '#0f5132';
      ctx.beginPath();
      ctx.roundRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8, 16);
      ctx.fill();

      /*
       * Foliage.
       *
       * This used to be a perfectly regular 24 px grid of identical circles,
       * each with an identical highlight in the same place, and it read as
       * polka dots rather than as a bush. The positions, sizes and tones are
       * now jittered by a hash of the clump's own coordinates — stable frame
       * to frame, so nothing crawls, but with no visible grid left.
       */
      const clumpStep = 22;
      const tones = ['#15803d', '#16a34a', '#22c55e'];
      for (let lx = b.x + 10; lx < b.x + b.w; lx += clumpStep) {
        for (let ly = b.y + 10; ly < b.y + b.h; ly += clumpStep) {
          const h1 = hash2(lx, ly);
          const h2 = hash2(ly, lx * 1.7);
          const h3 = hash2(lx * 0.3, ly * 2.1);

          // Clumps nudged off the lattice and sized unevenly.
          const px = lx + (h1 - 0.5) * clumpStep * 0.85;
          const py = ly + (h2 - 0.5) * clumpStep * 0.85;
          const r = 13 + h3 * 7;
          const sway = Math.sin(time + h1 * 6.283) * 2.2;

          ctx.fillStyle = tones[Math.floor(h3 * tones.length) % tones.length];
          ctx.beginPath();
          ctx.arc(px + sway, py, r, 0, Math.PI * 2);
          ctx.fill();

          // Highlight offset toward a fixed light, so the whole canopy is lit
          // from one direction instead of every leaf lighting itself.
          ctx.fillStyle = h1 > 0.45 ? '#4ade80' : '#34d399';
          ctx.beginPath();
          ctx.arc(px + sway - r * 0.25, py - r * 0.3, r * 0.58, 0, Math.PI * 2);
          ctx.fill();

          // The occasional flower, placed by the same hash so it is rare and
          // scattered rather than falling on a diagonal.
          if (h2 > 0.9) {
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.arc(px + sway, py - 2, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(px + sway, py - 2, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      ctx.restore();
    });
  };

  // Thorn Fields (Spike Super - Stick Around!)
  const drawThornFields = (ctx: CanvasRenderingContext2D, fields: any[]) => {
    const time = performance.now() * 0.005;
    fields.forEach(f => {
      if (!inView(f.x - f.radius, f.y - f.radius, f.radius * 2, f.radius * 2)) return;
      ctx.save();
      ctx.translate(f.x, f.y);

      // Toxic thorny ground circle
      const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, f.radius);
      grad.addColorStop(0, 'rgba(16, 185, 129, 0.45)');
      grad.addColorStop(1, 'rgba(5, 150, 105, 0.08)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, f.radius, 0, Math.PI * 2);
      ctx.fill();

      // Rotating dashed thorn perimeter
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -time * 30;
      ctx.stroke();

      // Spikes drawn inside
      ctx.fillStyle = '#10b981';
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4 + time;
        const rad = f.radius * 0.65;
        const sx = Math.cos(ang) * rad;
        const sy = Math.sin(ang) * rad;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 8);
        ctx.lineTo(sx + 6, sy + 6);
        ctx.lineTo(sx - 6, sy + 6);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    });
  };

  // Fire Patches (Brock Attack & Super Incendiary Ground Flames)
  const drawFirePatches = (ctx: CanvasRenderingContext2D, patches: any[]) => {
    const time = performance.now() * 0.008;
    patches.forEach(fp => {
      if (!inView(fp.x - fp.radius, fp.y - fp.radius, fp.radius * 2, fp.radius * 2)) return;
      ctx.save();
      ctx.translate(fp.x, fp.y);

      // Scorched ground center
      ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, fp.radius, 0, Math.PI * 2);
      ctx.fill();

      // Flickering orange & yellow fire tongues
      for (let i = 0; i < 7; i++) {
        const ang = (i * Math.PI * 2) / 7 + time * 0.5;
        const distR = fp.radius * 0.5 + Math.sin(time * 3 + i) * 6;
        const fx = Math.cos(ang) * distR;
        const fy = Math.sin(ang) * distR;

        ctx.fillStyle = i % 2 === 0 ? '#f59e0b' : '#ef4444';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(fx, fy, 8 + Math.sin(time * 5 + i) * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Center bright core
      ctx.fillStyle = '#fef08a';
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, 0, 10 + Math.sin(time * 6) * 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  };

  // High-Impact Visual Effects (Explosions, Shockwaves, Debris, Dashes, Band-Aid)
  const drawVisualEffects = (ctx: CanvasRenderingContext2D, effects: any[]) => {
    effects.forEach(fx => {
      ctx.save();
      ctx.translate(fx.x, fx.y);

      if (fx.type === 'hit_spark') {
        // Short cone of sparks thrown along the projectile's heading, plus a
        // bright core that collapses fast. Reads as a hit even in a crowd.
        const p = fx.progress || 0;
        const fade = Math.max(0, 1 - p);
        const weight = fx.intensity ?? 0.5;
        const heading = fx.angle ?? 0;

        ctx.globalAlpha = fade;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, fx.radius * 0.42 * (1 - p * 0.7), 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = fx.color || '#fde68a';
        ctx.lineWidth = 2 + weight * 2;
        ctx.lineCap = 'round';
        const sparkCount = 3 + Math.round(weight * 5);
        for (let i = 0; i < sparkCount; i++) {
          const spreadAngle = heading + ((i / (sparkCount - 1)) - 0.5) * 1.5;
          const reach = fx.radius * (0.5 + weight) * (0.35 + p * 0.9);
          ctx.beginPath();
          ctx.moveTo(Math.cos(spreadAngle) * fx.radius * 0.2, Math.sin(spreadAngle) * fx.radius * 0.2);
          ctx.lineTo(Math.cos(spreadAngle) * reach, Math.sin(spreadAngle) * reach);
          ctx.stroke();
        }

        ctx.restore();
        return;
      }

      if (fx.type === 'muzzle_flash') {
        const p = fx.progress || 0;
        const fade = Math.max(0, 1 - p);
        ctx.rotate(fx.angle ?? 0);
        ctx.globalAlpha = fade * 0.9;

        ctx.fillStyle = '#fffbeb';
        ctx.beginPath();
        ctx.ellipse(fx.radius * 0.35, 0, fx.radius * (0.55 + p * 0.5), fx.radius * 0.3 * fade, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = fx.color || '#fbbf24';
        ctx.globalAlpha = fade * 0.55;
        ctx.beginPath();
        ctx.moveTo(0, -fx.radius * 0.34);
        ctx.lineTo(fx.radius * 1.25, 0);
        ctx.lineTo(0, fx.radius * 0.34);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
        return;
      }

      if (fx.type === 'ground_slam') {
        // El Primo Earthquake Crater
        const p = fx.progress || 0;
        const r = fx.radius * p;
        const alpha = Math.max(0, 1 - p);

        // Expanding shockwave ring
        ctx.strokeStyle = `rgba(245, 158, 11, ${alpha})`;
        ctx.lineWidth = 6 * (1 - p);
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();

        // Ground fracture lines
        ctx.strokeStyle = `rgba(180, 83, 9, ${alpha * 0.8})`;
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 6; i++) {
          const ang = (i * Math.PI) / 3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(ang) * r * 0.85, Math.sin(ang) * r * 0.85);
          ctx.stroke();
        }
      } else if (fx.type === 'shockwave') {
        // Shelly Super Shockwave
        const p = fx.progress || 0;
        const r = fx.radius * p;
        const alpha = Math.max(0, 1 - p);

        ctx.strokeStyle = `rgba(232, 121, 249, ${alpha})`;
        ctx.lineWidth = 5 * (1 - p);
        ctx.shadowColor = '#c084fc';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (fx.type === 'smoke_poof') {
        // Leon Smoke Cloud
        const p = fx.progress || 0;
        const alpha = Math.max(0, 1 - p);

        ctx.fillStyle = `rgba(6, 182, 212, ${alpha * 0.5})`;
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 20;

        for (let i = 0; i < 8; i++) {
          const ang = (i * Math.PI) / 4;
          const distP = fx.radius * p * 0.8;
          ctx.beginPath();
          ctx.arc(Math.cos(ang) * distP, Math.sin(ang) * distP, 18 * (1 - p * 0.4), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (fx.type === 'band_aid') {
        // Shelly Band-Aid Healing Aura
        const p = fx.progress || 0;
        const alpha = Math.max(0, 1 - p);
        ctx.strokeStyle = `rgba(34, 197, 94, ${alpha})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, fx.radius * p, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = `rgba(74, 222, 128, ${alpha})`;
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✚', 0, -20 * p);
      } else if (fx.type === 'dash') {
        // Dash Dust Streaks
        const p = fx.progress || 0;
        const alpha = Math.max(0, 1 - p);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 8 * (1 - p), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    });
  };

  // Central Gem Mine (Gem Grab)
  const drawGemMine = (ctx: CanvasRenderingContext2D, mine: any) => {
    const time = performance.now() * 0.004;
    ctx.save();
    ctx.translate(mine.x, mine.y);

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.arc(0, 6, 52, 0, Math.PI * 2);
    ctx.fill();

    // 3D Stone Well Outer Rim
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Dark Crystal Chasm Interior
    ctx.fillStyle = '#090514';
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 2);
    ctx.fill();

    // Pulsing Gem Core
    const pulseScale = 1 + Math.sin(time * 3) * 0.15;
    ctx.save();
    ctx.scale(pulseScale, pulseScale);
    ctx.shadowColor = '#c084fc';
      ctx.shadowBlur = 24;
      drawGem(ctx, 20, time * 0.35);
    ctx.restore();

    // Emitting purple sonar rings
    const ringRadius = 20 + ((time * 30) % 35);
    ctx.strokeStyle = `rgba(192, 132, 252, ${Math.max(0, 1 - ringRadius / 55)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  };

  // Authentic 3D Showdown Wooden & Metal Power Cube Boxes
  const drawBoxes = (ctx: CanvasRenderingContext2D, boxes: any[]) => {
    boxes.forEach(b => {
      if (!inView(b.x, b.y, b.w, b.h)) return;
      ctx.save();

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(b.x + 3, b.y + 6, b.w, b.h);

      // 3D Wooden Chest Body
      ctx.fillStyle = '#78350f'; // Dark wood side
      ctx.fillRect(b.x, b.y, b.w, b.h);

      // Top face highlight (isometric bevel)
      ctx.fillStyle = '#b45309';
      ctx.fillRect(b.x, b.y, b.w, b.h * 0.55);

      // Wood plank lines
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + b.h * 0.35);
      ctx.lineTo(b.x + b.w, b.y + b.h * 0.35);
      ctx.moveTo(b.x, b.y + b.h * 0.7);
      ctx.lineTo(b.x + b.w, b.y + b.h * 0.7);
      ctx.stroke();

      // Metallic corner brackets
      ctx.fillStyle = '#f59e0b';
      const cornerSize = 10;
      ctx.fillRect(b.x, b.y, cornerSize, cornerSize);
      ctx.fillRect(b.x + b.w - cornerSize, b.y, cornerSize, cornerSize);
      ctx.fillRect(b.x, b.y + b.h - cornerSize, cornerSize, cornerSize);
      ctx.fillRect(b.x + b.w - cornerSize, b.y + b.h - cornerSize, cornerSize, cornerSize);

      // Metal rim stroke
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(b.x, b.y, b.w, b.h);

      // Skull or Star crest center symbol
      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', b.x + b.w / 2, b.y + b.h / 2);

      // Damage cracks if HP < maxHp
      if (b.hp < b.maxHp) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(b.x + 10, b.y + 10);
        ctx.lineTo(b.x + b.w * 0.45, b.y + b.h * 0.5);
        ctx.lineTo(b.x + b.w * 0.3, b.y + b.h - 8);
        ctx.stroke();
      }

      // Authentic Health Bar
      const hpPct = Math.max(0, b.hp / b.maxHp);
      const barW = b.w + 10;
      const barH = 7;
      const barX = b.x - 5;
      const barY = b.y - 14;

      // Dark capsule background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(barX - 1, barY - 1, Math.max(0, barW) + 2, barH + 2);

      // Green HP Fill
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(barX, barY, barW * hpPct, barH);

      ctx.restore();
    });
  };

  // High-Fidelity Pickups (Official Gems & Power Cubes)
  const drawPickups = (ctx: CanvasRenderingContext2D, gems: any[], cubes: any[]) => {
    const time = performance.now() * 0.005;

    // 1. Purple Gems
    gems.forEach(g => {
      if (!inView(g.x - 24, g.y - 24, 48, 48)) return;
      const bobY = Math.sin(time * 3 + g.x) * 4;
      ctx.save();
      ctx.translate(g.x, g.y + bobY);

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 14 - bobY, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Radial purple shine aura
      ctx.shadowColor = '#c084fc';
      ctx.shadowBlur = 16;

      drawGem(ctx, 16, time * 0.4 + g.x * 0.01);

      ctx.restore();
    });

    // 2. Emerald Power Cubes
    cubes.forEach(c => {
      if (!inView(c.x - 26, c.y - 26, 52, 52)) return;
      const bobY = Math.sin(time * 3 + c.x * 2) * 4;
      ctx.save();
      ctx.translate(c.x, c.y + bobY);

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 16 - bobY, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Emerald glow
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 18;

      drawPowerCube(ctx, 18, 0);

      ctx.restore();
    });
  };

  // 3D Isometric Wall Blocks
  const drawWalls = (ctx: CanvasRenderingContext2D, walls: any[]) => {
    walls.forEach(w => {
      if (!inView(w.x, w.y, w.w, w.h)) return;
      ctx.save();

      // Drop shadow for 3D depth
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(w.x + 4, w.y + 6, w.w, w.h);

      if (w.isDestructible) {
        // Wooden Barricade / Barrel Crate
        ctx.fillStyle = '#5c2d13'; // Dark side
        ctx.fillRect(w.x, w.y, w.w, w.h);

        // Top face highlight
        ctx.fillStyle = '#854d0e';
        ctx.fillRect(w.x, w.y, w.w, w.h * 0.6);

        // Iron straps
        ctx.fillStyle = '#71717a';
        ctx.fillRect(w.x, w.y + 6, w.w, 5);
        ctx.fillRect(w.x, w.y + w.h - 11, w.w, 5);

        ctx.strokeStyle = '#a16207';
        ctx.lineWidth = 2;
        ctx.strokeRect(w.x, w.y, w.w, w.h);
      } else {
        // High-Tech Indestructible Reinforced Fortress Blocks
        ctx.fillStyle = '#1e293b'; // Dark body
        ctx.fillRect(w.x, w.y, w.w, w.h);

        // Top beveled face
        ctx.fillStyle = '#334155';
        ctx.fillRect(w.x, w.y, w.w, w.h * 0.65);

        // Glowing cyan energy line
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2;
        ctx.strokeRect(w.x, w.y, w.w, w.h);

        ctx.fillStyle = '#38bdf8';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 6;
        ctx.fillRect(w.x + 4, w.y + 4, 6, 6);
        ctx.fillRect(w.x + w.w - 10, w.y + 4, 6, 6);
      }

      ctx.restore();
    });
  };

  // Authentic Brawler Rendering with Real Transparent Sprites & Status FX
  const drawBrawler = (
    ctx: CanvasRenderingContext2D,
    b: BrawlerEntity,
    isMe: boolean,
    localBrawler?: BrawlerEntity
  ) => {
    if (!b.isAlive) return;

    // Bush visibility logic
    if (!isMe && b.isInBush && !b.isVisibleToEnemies) {
      if (localBrawler && Math.hypot(localBrawler.x - b.x, localBrawler.y - b.y) > 85) {
        return;
      }
    }

    const cfg = BRAWLERS[b.brawlerId] ?? BRAWLERS.mira;
    const time = performance.now() * 0.005;

    // Handle Airborne Leap
    let elevateY = 0;
    let jumpScale = 1;
    if (b.isJumping) {
      const p = b.jumpProgress || 0;
      elevateY = -Math.sin(p * Math.PI) * 80;
      jumpScale = 1 + Math.sin(p * Math.PI) * 0.45;
    }

    ctx.save();
    ctx.translate(b.x, b.y);

    // Stealth / Bush Alpha / Hologram Clone
    if (b.isClone) {
      ctx.globalAlpha = 0.75; // Faint hologram
    } else if (b.invisibilityTimer > 0) {
      if (isMe) ctx.globalAlpha = 0.45;
      else {
        // Enemies only see faint shimmer if close (< 90px)
        if (localBrawler && Math.hypot(localBrawler.x - b.x, localBrawler.y - b.y) < 90) {
          ctx.globalAlpha = 0.25;
        } else {
          return; // Fully invisible!
        }
      }
    } else if (b.isInBush) {
      ctx.globalAlpha = isMe ? 0.6 : 0.45;
    }

    // 1. Ground shadow. Stays on the floor during a leap and shrinks with
    //    height, which is what reads as "airborne" from directly above.
    drawCharacterShadow(ctx, 54, -elevateY);

    // 2. Super Charged Aura (Signature Nova Arena Glowing Yellow Ring at feet)
    if (b.superCharge >= 100) {
      ctx.save();
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.ellipse(0, 16, 26, 12, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Spinning golden energy spark
      const sparkAng = time * 4;
      const sparkX = Math.cos(sparkAng) * 26;
      const sparkY = 16 + Math.sin(sparkAng) * 12;
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(sparkX, sparkY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. Aim Ring Indicator at feet
    ctx.save();
    ctx.rotate(b.aimAngle);
    ctx.fillStyle = isMe ? '#38bdf8' : b.team === 0 ? '#3b82f6' : '#ef4444';
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(18, -7);
    ctx.lineTo(18, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 4. Character body. Assembled from vector parts in the body's own local
    //    space, so it genuinely rotates to face where it aims instead of being
    //    a front-facing portrait mirrored left and right.
    ctx.save();
    ctx.translate(0, elevateY);
    ctx.scale(jumpScale, jumpScale);

    const moveSpeed = Math.hypot(b.vx, b.vy);
    const isMoving = moveSpeed > 5;

    drawCharacter(ctx, CHARACTER_STYLES[b.brawlerId] ?? CHARACTER_STYLES.mira, {
      aimAngle: b.aimAngle,
      // Legs follow travel, torso follows aim: that difference is what makes
      // strafing and backpedalling readable.
      moveAngle: isMoving ? Math.atan2(b.vy, b.vx) : b.aimAngle,
      speed01: Math.min(1, moveSpeed / (cfg.speed || 180)),
      time: performance.now() / 1000,
      // Driven by simulation time, so recoil decays identically everywhere.
      recoil01: Math.max(0, 1 - b.timeSinceLastAttack / 0.18),
      scale: 54,
    });

    // Hit flash: the same silhouette again, in white, fading over about a
    // tenth of a second. A connecting shot used to produce a number and
    // nothing else, so the body taking the damage never reacted at all.
    const flash = 1 - b.timeSinceLastDamage / HIT_FLASH_SECONDS;
    if (flash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, flash) * 0.75;
      ctx.globalCompositeOperation = 'lighter';
      drawCharacter(ctx, HIT_FLASH_STYLE, {
        aimAngle: b.aimAngle,
        moveAngle: isMoving ? Math.atan2(b.vy, b.vx) : b.aimAngle,
        speed01: Math.min(1, moveSpeed / (cfg.speed || 180)),
        time: performance.now() / 1000,
        recoil01: Math.max(0, 1 - b.timeSinceLastAttack / 0.18),
        scale: 54,
      });
      ctx.restore();
    }
    

    ctx.restore(); // Restore body transform

    // 4b. Ammo, drawn under the local character rather than only in a corner
    //     of the screen. Reading your own ammo should never mean looking away
    //     from the fight.
    if (isMe) {
      const pipWidth = 13;
      const pipGap = 3;
      const totalWidth = b.maxAmmo * pipWidth + (b.maxAmmo - 1) * pipGap;
      const pipY = 30;
      const whole = Math.floor(b.ammo);
      const refilling = b.ammo < b.maxAmmo ? b.reloadTimer / (cfg.reloadTime || 1) : 0;

      for (let slot = 0; slot < b.maxAmmo; slot++) {
        const px = -totalWidth / 2 + slot * (pipWidth + pipGap);
        // Full slots read solid; the one currently refilling fills left to
        // right, so the wait is legible at a glance.
        const fill = slot < whole ? 1 : slot === whole ? Math.min(1, refilling) : 0;

        ctx.fillStyle = 'rgba(2, 6, 23, 0.8)';
        ctx.beginPath();
        ctx.roundRect(px, pipY, pipWidth, 5, 2.5);
        ctx.fill();

        if (fill > 0) {
          ctx.fillStyle = fill >= 1 ? '#fbbf24' : '#a16207';
          ctx.beginPath();
          ctx.roundRect(px, pipY, pipWidth * fill, 5, 2.5);
          ctx.fill();
        }
      }
    }

    // 5. Star Power & Status Trails:
    if (b.brawlerId === 'rivet' && isMoving) {
      // Colt Slick Boots: Golden speed trail
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(-16 + (Math.random() - 0.5) * 6, 16, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.speedBoostTimer > 0 && b.speedBoostMagnitude >= 1.3 && isMoving) {
      // Sparks off a brawler running on a speed buff.
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(-16, 16, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dizzy Stars for Stun, Vines for Slow, Speed Lines
    if (b.stunTimer > 0) {
      ctx.save();
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      const starAng = time * 8;
      const sx = Math.cos(starAng) * 18;
      const sy = -38 + Math.sin(starAng) * 6;
      ctx.fillText('💫', sx, sy);
      ctx.restore();
    } else if (b.slowTimer > 0) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 16, 20, 0, Math.PI * 2);
      ctx.stroke();
    } else if (b.speedBoostTimer > 0) {
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-18, 12);
      ctx.lineTo(-32, 12);
      ctx.moveTo(-14, 18);
      ctx.lineTo(-28, 18);
      ctx.stroke();
    }

    // 6. Active Emote Pin
    if (b.activeEmote) {
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.activeEmote, 0, -64 + elevateY);
    }

    ctx.restore(); // Restore brawler world transform

    // 7. AUTHENTIC NOVA ARENA HEAD HUD (Health, Ammo, Cubes, Band-Aid badge)
    ctx.save();
    ctx.translate(b.x, b.y + elevateY);

    // Player Name & Badges
    ctx.font = 'bold 13px Rajdhani, Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isMe ? '#f8fafc' : '#cbd5e1';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    const badgeText =
      b.name +
      (b.powerCubes > 0 ? ` [⚡${b.powerCubes}]` : '') +
      (b.gemsCarried > 0 ? ` [💎${b.gemsCarried}]` : '') +
      (hasArmedPassive(b) ? ' [✚]' : '');
    ctx.fillText(badgeText, 0, -42);

    // Segmented Health Bar
    const hpWidth = 54;
    const hpHeight = 7;
    const hpPct = Math.max(0, b.hp / b.maxHp);
    const barX = -hpWidth / 2;
    const barY = -34;

    // Dark pill background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(barX - 1, barY - 1, hpWidth + 2, hpHeight + 2);

    // Team colored fill (Green for self/ally, Red for enemy)
    ctx.fillStyle = isMe ? '#22c55e' : b.team === 0 ? '#3b82f6' : '#ef4444';
    ctx.fillRect(barX, barY, hpWidth * hpPct, hpHeight);

    // Authentic Segment Dividers (Notches every 1000 HP)
    const segmentCount = Math.max(1, Math.round(b.maxHp / 1000));
    ctx.fillStyle = '#0f172a';
    for (let s = 1; s < segmentCount; s++) {
      const notchX = barX + (hpWidth / segmentCount) * s;
      ctx.fillRect(notchX, barY, 1.5, hpHeight);
    }

    // Border around HP bar
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, hpWidth, hpHeight);

    // 3 Reload Ammo Slots (Bright amber/orange)
    const ammoGap = 2;
    const ammoWidth = (hpWidth - ammoGap * 2) / 3;
    const ammoY = -24;
    for (let i = 0; i < 3; i++) {
      const segPct = Math.max(0, Math.min(1, b.ammo - i));
      const segX = barX + i * (ammoWidth + ammoGap);

      // Slot background
      ctx.fillStyle = '#090d16';
      ctx.fillRect(segX, ammoY, ammoWidth, 3.5);

      // Slot fill
      ctx.fillStyle = isMe ? '#f59e0b' : '#94a3b8';
      ctx.fillRect(segX, ammoY, ammoWidth * segPct, 3.5);
    }

    ctx.restore();
  };

  // High-Impact Weapon Projectiles Styled by Brawler Type
  const drawProjectile = (ctx: CanvasRenderingContext2D, p: any) => {
    ctx.save();
    ctx.translate(p.x, p.y);

    const angle = Math.atan2(p.vy, p.vx);
    ctx.rotate(angle);

    if (p.brawlerId === 'fuse') {
      // Brock Guided Rocket with Flame Exhaust
      ctx.fillStyle = '#f59e0b';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = p.isSuper ? 20 : 12;

      ctx.fillRect(-12, -4, 20, 8);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(8, -4);
      ctx.lineTo(16, 0);
      ctx.lineTo(8, 4);
      ctx.closePath();
      ctx.fill();

      // Exhaust flames
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(-12, -3);
      ctx.lineTo(-22, 0);
      ctx.lineTo(-12, 3);
      ctx.closePath();
      ctx.fill();
    } else if (p.brawlerId === 'wisp') {
      // Leon Spinning Shuriken Blades
      const spin = performance.now() * 0.025;
      ctx.rotate(spin);
      ctx.fillStyle = '#06b6d4';
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 10;

      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(8, -2.5);
        ctx.lineTo(15, 0);
        ctx.lineTo(8, 2.5);
        ctx.closePath();
        ctx.fill();
      }
    } else if (p.brawlerId === 'rivet') {
      // Colt High-Velocity Neon Laser Tracers
      ctx.fillStyle = p.isSuper ? '#fbbf24' : '#38bdf8';
      ctx.shadowColor = p.isSuper ? '#f59e0b' : '#0284c7';
      ctx.shadowBlur = 14;

      const bLen = p.isSuper ? 32 : 20;
      ctx.beginPath();
      ctx.ellipse(0, 0, bLen, p.radius, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(2, 0, bLen * 0.6, p.radius * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.brawlerId === 'thorn') {
      // Spike Cactus Bomb / Needle
      ctx.fillStyle = '#10b981';
      ctx.shadowColor = '#059669';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#047857';
      for (let i = 0; i < 6; i++) {
        const thAng = (i * Math.PI) / 3;
        const tx = Math.cos(thAng) * (p.radius + 3);
        const ty = Math.sin(thAng) * (p.radius + 3);
        ctx.beginPath();
        ctx.arc(tx, ty, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (p.brawlerId === 'boulder') {
      // El Primo Flying Flaming Punch
      ctx.fillStyle = '#f59e0b';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(2, 0, p.radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Shelly Shotgun Pellet & Generic Projectiles
      ctx.fillStyle = p.color || '#f59e0b';
      ctx.shadowColor = p.color || '#f59e0b';
      ctx.shadowBlur = p.isSuper ? 16 : 8;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, p.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  // Showdown Poison Smoke Gas
  const drawPoisonGas = (ctx: CanvasRenderingContext2D, inset: number) => {
    ctx.save();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.42)';
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 24;

    ctx.fillRect(0, 0, MAP_WIDTH, inset);
    ctx.fillRect(0, MAP_HEIGHT - inset, MAP_WIDTH, inset);
    ctx.fillRect(0, inset, inset, MAP_HEIGHT - inset * 2);
    ctx.fillRect(MAP_WIDTH - inset, inset, inset, MAP_HEIGHT - inset * 2);

    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 6;
    ctx.strokeRect(inset, inset, MAP_WIDTH - inset * 2, MAP_HEIGHT - inset * 2);
    ctx.restore();
  };

  // Authentic Nova Arena Aiming Reticle (Normal Mode vs Golden Super Mode)
  /**
   * Characters whose Super lands on a chosen spot rather than firing along a
   * line. These preview as a target circle; everyone else previews as the
   * actual spread of what they are about to fire.
   */
  const AREA_SUPERS: Partial<Record<BrawlerId, number>> = {
    fuse: 150,
    thorn: 135,
    boulder: 125,
  };

  /**
   * Ground preview of the shot being lined up.
   *
   * The old reticle was a fixed pair of dashed rays that showed neither range
   * nor spread, so there was no way to know whether a target was actually
   * inside the attack without firing. This draws the real shape: the cone a
   * scattergun covers, the lane a rifle fires down, or the blast radius an area
   * Super will drop — all at true scale, so the preview is the shot.
   */
  const drawAimReticle = (
    ctx: CanvasRenderingContext2D,
    b: BrawlerEntity,
    isSuperAiming: boolean
  ) => {
    const touch = touchRef.current;
    const aimingSuper = isSuperAiming || (touch.isAiming && touch.actionKind === 'super');

    // On a phone the preview belongs to the stick; on desktop the cursor is
    // always aiming at something, so a quiet preview is always useful.
    const engaged = isTouchDeviceRef.current ? touch.isAiming : true;
    if (!engaged) return;

    const cfg = BRAWLERS[b.brawlerId] ?? BRAWLERS.mira;
    const ready = b.superCharge >= 100;
    const tint = aimingSuper && ready ? '#facc15' : cfg.color;
    const strength = isTouchDeviceRef.current ? 1 : 0.55;

    ctx.save();
    ctx.translate(b.x, b.y);

    const areaRadius = aimingSuper && ready ? AREA_SUPERS[b.brawlerId] : undefined;

    if (areaRadius !== undefined) {
      // Landing-spot preview: a line out to the target and the blast it covers.
      const targetX = mouseRef.current.worldX - b.x;
      const targetY = mouseRef.current.worldY - b.y;
      const reach = Math.min(Math.hypot(targetX, targetY), cfg.range);
      const ang = Math.atan2(targetY, targetX);
      const px = Math.cos(ang) * reach;
      const py = Math.sin(ang) * reach;

      ctx.globalAlpha = 0.55 * strength;
      ctx.strokeStyle = tint;
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * 26, Math.sin(ang) * 26);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.globalAlpha = 0.2 * strength;
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.arc(px, py, areaRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.85 * strength;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, areaRadius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Cone or lane preview at the attack's true range and spread.
      const angle = b.aimAngle;
      const range = aimingSuper && ready ? cfg.range * 1.15 : cfg.range;
      const halfSpread = Math.max(cfg.spreadAngle * 0.5, 0.035);

      ctx.rotate(angle);
      ctx.globalAlpha = 0.17 * strength;
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.arc(0, 0, range, -halfSpread, halfSpread);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 0.7 * strength;
      ctx.strokeStyle = tint;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(Math.cos(-halfSpread) * range, Math.sin(-halfSpread) * range);
      ctx.moveTo(18, 0);
      ctx.lineTo(Math.cos(halfSpread) * range, Math.sin(halfSpread) * range);
      ctx.stroke();

      // Range marker, so the edge of the attack is unambiguous.
      ctx.globalAlpha = 0.5 * strength;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, range, -halfSpread, halfSpread);
      ctx.stroke();
    }

    ctx.restore();

    // Armed-Super halo at the feet.
    if (aimingSuper && ready) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 16, 32, 15, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  /**
   * Pre-match countdown.
   *
   * The match used to begin after two silent seconds in which nothing told the
   * player the round had not started yet, so the first thing many people did
   * was walk into a fight that had already begun without them.
   */
  const drawIntroCountdown = (
    ctx: CanvasRenderingContext2D,
    view: ViewMetrics,
    remaining: number,
    mapName: string
  ) => {
    const whole = Math.ceil(remaining);
    // Each number swells as it appears and settles, so the beat is readable
    // even at a glance.
    const phase = 1 - (remaining - Math.floor(remaining));
    const scale = 1 + Math.max(0, 0.5 - phase) * 1.4;

    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

    ctx.fillStyle = 'rgba(2, 6, 23, 0.35)';
    ctx.fillRect(0, 0, view.w, view.h);

    ctx.translate(view.w / 2, view.h * 0.42);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = 'bold 96px Orbitron, system-ui, sans-serif';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeText(`${whole}`, 0, 0);
    ctx.fillStyle = '#facc15';
    ctx.fillText(`${whole}`, 0, 0);

    ctx.font = 'bold 20px Orbitron, system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeText('HAZIRLAN', 0, 76);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('HAZIRLAN', 0, 76);

    if (mapName) {
      ctx.font = 'bold 15px Orbitron, system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0f172a';
      ctx.strokeText(mapName, 0, 108);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(mapName, 0, 108);
    }

    ctx.restore();
  };

  /**
   * A turret, mine, station or barrier.
   *
   * Drawn from its owner's palette, so you can tell at a glance whose machine
   * it is, with a health ring only while it is damaged — a field full of
   * permanent bars is noise.
   */
  const drawDeployable = (
    ctx: CanvasRenderingContext2D,
    d: DeployedEntity,
    /** Seconds, for the blink on an armed mine. */
    time: number
  ) => {
    const style = CHARACTER_STYLES[d.brawlerId];
    const r = d.radius;

    ctx.save();
    ctx.translate(d.x, d.y);

    // Contact shadow, so it sits on the ground rather than floating over it.
    ctx.fillStyle = 'rgba(2, 6, 23, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.45, r * 0.95, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#15161f';

    if (d.kind === 'turret') {
      // Hexagonal base and a barrel that follows whatever it is tracking.
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = style.secondary;
      ctx.fill();
      ctx.stroke();

      ctx.rotate(d.angle);
      ctx.beginPath();
      ctx.roundRect(0, -r * 0.22, r * 1.25, r * 0.44, r * 0.14);
      ctx.fillStyle = style.accent;
      ctx.fill();
      ctx.stroke();
      ctx.rotate(-d.angle);

      ctx.beginPath();
      ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = style.primary;
      ctx.fill();
      ctx.stroke();
    } else if (d.kind === 'mine') {
      // Small, low, and blinking — it has to be spottable if you are looking.
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = style.secondary;
      ctx.fill();
      ctx.stroke();

      const blink = 0.45 + 0.55 * Math.abs(Math.sin(time * 4));
      ctx.globalAlpha = blink;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = '#f87171';
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (d.kind === 'healStation') {
      // A cross on a plate, with the reach drawn as a soft ring so standing
      // in it is a visible decision.
      ctx.beginPath();
      ctx.arc(0, 0, d.range, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(249, 168, 212, 0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(249, 168, 212, 0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.lineWidth = 3;
      ctx.strokeStyle = '#15161f';
      ctx.beginPath();
      ctx.roundRect(-r, -r, r * 2, r * 2, r * 0.3);
      ctx.fillStyle = style.secondary;
      ctx.fill();
      ctx.stroke();

      const arm = r * 0.68;
      const thick = r * 0.26;
      ctx.fillStyle = style.accent;
      ctx.beginPath();
      ctx.roundRect(-thick / 2, -arm, thick, arm * 2, thick * 0.4);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-arm, -thick / 2, arm * 2, thick, thick * 0.4);
      ctx.fill();
      ctx.stroke();
    } else if (d.kind === 'barrier') {
      // An arc facing the way it was placed: cover, not a wall.
      ctx.rotate(d.angle);
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI * 0.55, Math.PI * 0.55);
      ctx.lineWidth = r * 0.45;
      ctx.strokeStyle = style.accent;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = '#15161f';
      ctx.stroke();
    } else {
      // Minion: a small body with a facing notch.
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = style.primary;
      ctx.fill();
      ctx.stroke();
      ctx.rotate(d.angle);
      ctx.beginPath();
      ctx.roundRect(r * 0.4, -r * 0.2, r * 0.6, r * 0.4, r * 0.15);
      ctx.fillStyle = style.accent;
      ctx.fill();
      ctx.stroke();
    }

    if (d.hp < d.maxHp && d.kind !== 'barrier') {
      ctx.rotate(0);
      const pct = Math.max(0, d.hp / d.maxHp);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.6)';
      ctx.beginPath();
      ctx.arc(0, 0, r + 7, -Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();
      ctx.strokeStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(0, 0, r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
      ctx.stroke();
    }

    ctx.restore();
  };

  /**
   * Arrows for enemies you cannot see, and a wedge for the side you were just
   * hit from.
   *
   * Taking fire from somewhere off the edge of the screen is the most common
   * way to die without understanding why. The wedge answers "where did that
   * come from"; the arrows answer "who is about to".
   */
  const drawEdgeIndicators = (
    ctx: CanvasRenderingContext2D,
    view: ViewMetrics,
    cam: { x: number; y: number },
    snap: BrawlSnapshot,
    me: BrawlerEntity
  ) => {
    if (!me.isAlive) return;

    const cx = view.w / 2;
    const cy = view.h / 2;
    const inset = 30;

    // ---- nearest threats that are off screen ---------------------------
    const off: Array<{ sx: number; sy: number; dist: number; color: string }> = [];
    for (const b of snap.brawlers) {
      if (b.id === me.id || !b.isAlive || b.isClone || b.team === me.team) continue;
      // The same visibility rule as drawing them: an arrow must not give away
      // somebody hiding in a bush.
      if (b.isInBush && !b.isVisibleToEnemies) continue;

      const sx = cx + (b.x - cam.x) * view.zoom;
      const sy = cy + (b.y - cam.y) * view.zoom;
      if (sx > -12 && sx < view.w + 12 && sy > -12 && sy < view.h + 12) continue;

      const dist = Math.hypot(b.x - me.x, b.y - me.y);
      if (dist > 1600) continue;
      off.push({ sx, sy, dist, color: BRAWLERS[b.brawlerId]?.color ?? '#ef4444' });
    }
    off.sort((a, b) => a.dist - b.dist);

    for (const t of off.slice(0, 4)) {
      const dx = t.sx - cx;
      const dy = t.sy - cy;
      // Walk the ray from the centre out to the inset rectangle.
      const k = Math.min(
        (cx - inset) / Math.max(Math.abs(dx), 1e-6),
        (cy - inset) / Math.max(Math.abs(dy), 1e-6)
      );
      const px = cx + dx * k;
      const py = cy + dy * k;
      const alpha = Math.max(0.35, Math.min(0.95, 1 - (t.dist - 500) / 1100));

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(-8, -10);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-8, 10);
      ctx.closePath();
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#15161f';
      ctx.stroke();
      // The enemy's own colour, so two arrows can be told apart at a glance.
      ctx.beginPath();
      ctx.arc(-9, 0, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = t.color;
      ctx.fill();
      ctx.restore();
    }

    // ---- where the last hit came from ----------------------------------
    const since = me.timeSinceLastDamage;
    if (since < DAMAGE_MARKER_SECONDS && Math.abs(me.lastDamageAngle) <= 10) {
      const fade = 1 - since / DAMAGE_MARKER_SECONDS;
      const radius = Math.min(view.w, view.h) * 0.34;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(me.lastDamageAngle);
      ctx.lineCap = 'round';
      ctx.lineWidth = 18;
      ctx.strokeStyle = 'rgba(15, 23, 42, ' + fade * 0.45 + ')';
      ctx.beginPath();
      ctx.arc(0, 0, radius, -0.3, 0.3);
      ctx.stroke();
      ctx.lineWidth = 11;
      ctx.strokeStyle = 'rgba(239, 68, 68, ' + fade * 0.9 + ')';
      ctx.beginPath();
      ctx.arc(0, 0, radius, -0.3, 0.3);
      ctx.stroke();
      ctx.restore();
    }
  };

  /** The announcement for a kill: pops in, holds, fades. */
  const drawKillBanner = (
    ctx: CanvasRenderingContext2D,
    view: ViewMetrics,
    text: string,
    ageMs: number
  ) => {
    // A fast overshoot into place, so it arrives with some force.
    const pop = Math.min(1, ageMs / 140);
    const scale = 0.6 + 0.4 * pop + Math.sin(pop * Math.PI) * 0.18;
    const fade = ageMs > KILL_BANNER_MS - 400 ? (KILL_BANNER_MS - ageMs) / 400 : 1;

    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.translate(view.w / 2, view.h * 0.2);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = 'bold 28px Orbitron, system-ui, sans-serif';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = '#facc15';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };

  /**
   * What you see while you are waiting to come back.
   *
   * Two different situations share this overlay, and they need to read
   * differently: in a mode with respawn the wait is a countdown you can plan
   * around, and in an elimination mode it is over and the camera is now
   * following somebody else.
   */
  const drawDeathOverlay = (
    ctx: CanvasRenderingContext2D,
    view: ViewMetrics,
    respawnTimer: number,
    spectatingId: string | null,
    snap: BrawlSnapshot | null
  ) => {
    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

    ctx.fillStyle = 'rgba(2, 6, 23, 0.45)';
    ctx.fillRect(0, 0, view.w, view.h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(view.w / 2, view.h * 0.4);

    if (respawnTimer > 0) {
      const whole = Math.ceil(respawnTimer);
      ctx.font = 'bold 84px Orbitron, system-ui, sans-serif';
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#0f172a';
      ctx.strokeText(`${whole}`, 0, 0);
      ctx.fillStyle = '#60a5fa';
      ctx.fillText(`${whole}`, 0, 0);

      ctx.font = 'bold 18px Orbitron, system-ui, sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#0f172a';
      ctx.strokeText('GERİ DÖNÜYORSUN', 0, 68);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText('GERİ DÖNÜYORSUN', 0, 68);
    } else {
      ctx.font = 'bold 34px Orbitron, system-ui, sans-serif';
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#0f172a';
      ctx.strokeText('ELENDİN', 0, 0);
      ctx.fillStyle = '#f87171';
      ctx.fillText('ELENDİN', 0, 0);

      const watched = snap?.brawlers.find(b => b.id === spectatingId);
      const label = watched ? `İZLENİYOR: ${watched.name}` : 'MAÇ İZLENİYOR';
      ctx.font = 'bold 16px Orbitron, system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0f172a';
      ctx.strokeText(label, 0, 46);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(label, 0, 46);
    }

    ctx.restore();
  };

  /**
   * Frame budget and entity counts, toggled with F3.
   *
   * Simulation and render are timed separately because they fail for different
   * reasons and are fixed in different places; a single "FPS" number hides
   * which one is actually costing you the frame.
   */
  const drawDiagnostics = (ctx: CanvasRenderingContext2D, view: ViewMetrics) => {
    const lines = [
      `${profiler.fps.toFixed(0)} fps   frame ${profiler.frame.average.toFixed(2)}ms (p95 ${profiler.frame.p95.toFixed(2)})`,
      `sim ${profiler.simulation.average.toFixed(2)}ms (p95 ${profiler.simulation.p95.toFixed(2)})   steps ${profiler.stepsLastFrame}`,
      `draw ${profiler.render.average.toFixed(2)}ms (p95 ${profiler.render.p95.toFixed(2)})`,
      Object.entries(profiler.counts)
        .map(([label, value]) => `${label} ${value}`)
        .join('   '),
      `zoom ${view.zoom.toFixed(2)}   dpr ${view.dpr}   view ${Math.round(view.worldW)}x${Math.round(view.worldH)}   clock ${profiler.clockSource}`,
    ];

    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Sits below the top HUD bar so the two do not overlap.
    const top = 62;
    const width = Math.max(...lines.map(l => ctx.measureText(l).width)) + 20;
    const height = lines.length * 16 + 16;

    ctx.fillStyle = 'rgba(2, 6, 23, 0.82)';
    ctx.fillRect(10, top, width, height);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, top, width, height);

    ctx.fillStyle = '#e2e8f0';
    lines.forEach((line, i) => ctx.fillText(line, 20, top + 10 + i * 16));
    ctx.restore();
  };

  const drawFloatingNumbers = (ctx: CanvasRenderingContext2D, numbers: any[]) => {
    numbers.forEach(fn => {
      ctx.save();
      ctx.font = '900 16px Orbitron, Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = fn.color;
      ctx.shadowColor = fn.color;
      ctx.shadowBlur = 10;
      ctx.globalAlpha = Math.max(0, Math.min(1, fn.alpha));
      ctx.fillText(fn.text, fn.x, fn.y);
      ctx.restore();
    });
  };

  // Mobile Touch Virtual Joysticks & Gadget Button (Screen space overlay)
  /**
   * On-screen controls, drawn in screen space over the world.
   *
   * Both sticks are floating, so the base is only drawn once a finger is down —
   * a permanently visible pad would just be furniture the player has to aim
   * around. The action stick additionally shows the shot it is lining up; see
   * `drawAimPreview`, which draws the same shape on the ground.
   */
  const drawMobileTouchControls = (
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    myBrawler: BrawlerEntity | undefined,
    _isSuperAiming: boolean
  ) => {
    const touch = touchRef.current;
    const layout = touch.getLayout();

    const stickBase = (x: number, y: number, radius: number, color: string) => {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const stickKnob = (x: number, y: number, radius: number, color: string) => {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#f8fafc';
      ctx.stroke();
    };

    // Movement stick.
    if (touch.move.active) {
      stickBase(touch.move.originX, touch.move.originY, 60, '#38bdf8');
      const reach = 60 * touch.move.magnitude;
      stickKnob(
        touch.move.originX + touch.move.dirX * reach,
        touch.move.originY + touch.move.dirY * reach,
        26,
        '#0ea5e9'
      );
    }

    // Action stick.
    if (touch.action.active) {
      const isSuper = touch.actionKind === 'super';
      const tint = isSuper ? '#facc15' : '#f87171';
      stickBase(touch.action.originX, touch.action.originY, 66, tint);
      const reach = 66 * touch.action.magnitude;
      stickKnob(
        touch.action.originX + touch.action.dirX * reach,
        touch.action.originY + touch.action.dirY * reach,
        28,
        isSuper ? '#eab308' : '#ef4444'
      );
    }

    // Super button, filled clockwise as the Super charges.
    const charge = myBrawler ? Math.min(1, myBrawler.superCharge / 100) : 0;
    const ready = charge >= 1;

    ctx.beginPath();
    ctx.arc(layout.superX, layout.superY, layout.superRadius, 0, Math.PI * 2);
    ctx.fillStyle = ready ? 'rgba(234, 179, 8, 0.9)' : 'rgba(30, 41, 59, 0.85)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = ready ? '#fde047' : '#475569';
    ctx.stroke();

    if (!ready) {
      ctx.beginPath();
      ctx.arc(
        layout.superX,
        layout.superY,
        layout.superRadius - 2,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * charge
      );
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#eab308';
      ctx.stroke();
    }

    ctx.fillStyle = ready ? '#422006' : '#94a3b8';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', layout.superX, layout.superY + 1);

    // Gadget button.
    const charges = myBrawler?.gadgetCharges ?? 0;
    const gadgetReady = charges > 0 && (myBrawler?.gadgetCooldown ?? 1) <= 0;

    ctx.beginPath();
    ctx.arc(layout.gadgetX, layout.gadgetY, layout.gadgetRadius, 0, Math.PI * 2);
    ctx.fillStyle = gadgetReady ? 'rgba(34, 197, 94, 0.85)' : 'rgba(30, 41, 59, 0.8)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = gadgetReady ? '#4ade80' : '#475569';
    ctx.stroke();

    ctx.fillStyle = gadgetReady ? '#052e16' : '#94a3b8';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`x${charges}`, layout.gadgetX, layout.gadgetY + 1);

    void viewW;
    void viewH;
  };

  /*
   * Touches are routed by identifier, not by where they currently are. The
   * previous handlers compared the live position against the screen midpoint on
   * every move, so dragging an aim leftwards across the middle silently took
   * over the movement stick mid-fight.
   */
  const toLocal = (t: React.Touch, rect: DOMRect) => ({
    x: t.clientX - rect.left,
    y: t.clientY - rect.top,
  });

  const handleTouchStart = (e: React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const { x, y } = toLocal(t, rect);
      touchRef.current.onTouchStart(t.identifier, x, y, rect.width);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const { x, y } = toLocal(t, rect);
      touchRef.current.onTouchMove(t.identifier, x, y);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const { x, y } = toLocal(t, rect);
      touchRef.current.onTouchEnd(t.identifier, x, y);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center select-none overflow-hidden touch-none"
    >
      <canvas
        ref={canvasRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className="w-full h-full object-cover block cursor-crosshair"
      />
    </div>
  );
};
