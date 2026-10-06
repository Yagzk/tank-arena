import React, { useEffect, useRef, useState } from 'react';
import {
  BrawlSnapshot,
  BrawlPlayerInput,
  BrawlerEntity,
  BRAWLERS,
  BrawlerId,
} from '../types/brawl';
import { MAP_WIDTH, MAP_HEIGHT } from '../game/brawlMaps';
import { assetLoader } from '../game/assetLoader';

interface BrawlCanvasProps {
  snapshot: BrawlSnapshot | null;
  myPlayerId: string;
  onSendInput: (input: BrawlPlayerInput) => void;
}

export const BrawlCanvas: React.FC<BrawlCanvasProps> = ({
  snapshot,
  myPlayerId,
  onSendInput,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Smooth Camera Coordinates & Screen Shake
  const cameraRef = useRef<{ x: number; y: number }>({ x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 });
  const screenShakeRef = useRef<{ intensity: number; timer: number }>({ intensity: 0, timer: 0 });

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
  const moveJoystickRef = useRef<{ active: boolean; startX: number; startY: number; curX: number; curY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    curX: 0,
    curY: 0,
  });
  const aimJoystickRef = useRef<{ active: boolean; startX: number; startY: number; curX: number; curY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    curX: 0,
    curY: 0,
  });
  const superTouchRef = useRef<boolean>(false);
  const gadgetTouchRef = useRef<boolean>(false);

  // Stable references
  const snapshotRef = useRef<BrawlSnapshot | null>(snapshot);
  snapshotRef.current = snapshot;
  const myPlayerIdRef = useRef<string>(myPlayerId);
  myPlayerIdRef.current = myPlayerId;
  const onSendInputRef = useRef<(input: BrawlPlayerInput) => void>(onSendInput);
  onSendInputRef.current = onSendInput;

  // Initialize Assets & Touch Device Detection
  useEffect(() => {
    assetLoader.loadAll();
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      setIsTouchDevice(true);
    }
  }, []);

  // Window Resize Handling for Crisp Canvas DPI
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && containerRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth || window.innerWidth;
        canvasRef.current.height = containerRef.current.clientHeight || window.innerHeight;
      }
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
      mouseRef.current.worldX = sx - canvas.width / 2 + cam.x;
      mouseRef.current.worldY = sy - canvas.height / 2 + cam.y;
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
      const myBrawler = snap?.brawlers.find(b => b.id === myId);

      // Desktop WASD movement
      let moveX = 0;
      let moveY = 0;
      if (keys['keyw'] || keys['w'] || keys['arrowup']) moveY -= 1;
      if (keys['keys'] || keys['s'] || keys['arrowdown']) moveY += 1;
      if (keys['keya'] || keys['a'] || keys['arrowleft']) moveX -= 1;
      if (keys['keyd'] || keys['d'] || keys['arrowright']) moveX += 1;

      // Mobile Touch Move Joystick override
      if (moveJoystickRef.current.active) {
        const dx = moveJoystickRef.current.curX - moveJoystickRef.current.startX;
        const dy = moveJoystickRef.current.curY - moveJoystickRef.current.startY;
        const dist = Math.hypot(dx, dy);
        if (dist > 10) {
          moveX = dx / dist;
          moveY = dy / dist;
        }
      }

      // Aim angle
      let aimAngle = 0;
      if (myBrawler) {
        if (aimJoystickRef.current.active) {
          const dx = aimJoystickRef.current.curX - aimJoystickRef.current.startX;
          const dy = aimJoystickRef.current.curY - aimJoystickRef.current.startY;
          if (Math.hypot(dx, dy) > 10) {
            aimAngle = Math.atan2(dy, dx);
          }
        } else {
          aimAngle = Math.atan2(
            mouseRef.current.worldY - myBrawler.y,
            mouseRef.current.worldX - myBrawler.x
          );
        }
      }

      const isMouseFiring = mouseRef.current.isDown;
      const isTouchFiring =
        aimJoystickRef.current.active &&
        Math.hypot(
          aimJoystickRef.current.curX - aimJoystickRef.current.startX,
          aimJoystickRef.current.curY - aimJoystickRef.current.startY
        ) > 25;

      let isSuperAttack = false;
      let isNormalAttack = false;

      // If Super Aiming Mode is active, clicking fires the Super!
      if (isSuperAimingRef.current && (isMouseFiring || isTouchFiring || superTouchRef.current)) {
        if (myBrawler && myBrawler.superCharge >= 100) {
          isSuperAttack = true;
          isSuperAimingRef.current = false; // Reset after launching
        }
      } else {
        isNormalAttack = isMouseFiring || isTouchFiring;
        if (superTouchRef.current && myBrawler && myBrawler.superCharge >= 100) {
          isSuperAttack = true;
        }
      }

      const isGadget = !!(keys['keye'] || keys['e'] || gadgetTouchRef.current);
      if (gadgetTouchRef.current) gadgetTouchRef.current = false;

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
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const snap = snapshotRef.current;
      const myId = myPlayerIdRef.current;
      const myBrawler = snap?.brawlers.find(b => b.id === myId);

      // Smooth Camera tracking
      if (myBrawler) {
        const targetX = Math.max(canvas.width / 2, Math.min(MAP_WIDTH - canvas.width / 2, myBrawler.x));
        const targetY = Math.max(canvas.height / 2, Math.min(MAP_HEIGHT - canvas.height / 2, myBrawler.y));
        cameraRef.current.x += (targetX - cameraRef.current.x) * 0.12;
        cameraRef.current.y += (targetY - cameraRef.current.y) * 0.12;
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

      // 1. CLEAR & SAVE WORLD MATRIX
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2 - cam.x + shakeX, canvas.height / 2 - cam.y + shakeY);

      // 2. DRAW GROUND & TILES
      drawGroundTiles(ctx);

      if (snap) {
        // Trigger screen shake on recent high-impact visual effects
        if (snap.visualEffects && snap.visualEffects.length > 0) {
          const freshEffect = snap.visualEffects.find(fx => fx.progress < 0.1);
          if (freshEffect && screenShakeRef.current.timer <= 0) {
            screenShakeRef.current = { intensity: 8, timer: 0.22 };
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

        // 10. DRAW BRAWLERS
        snap.brawlers.forEach(b => {
          drawBrawler(ctx, b, b.id === myId, myBrawler);
        });

        // 11. DRAW PROJECTILES
        snap.projectiles.forEach(p => {
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

      // 16. MOBILE ON-SCREEN CONTROLS (Screen space overlay)
      if (isTouchDevice) {
        drawMobileTouchControls(
          ctx,
          canvas.width,
          canvas.height,
          snap?.brawlers.find(b => b.id === myId),
          isSuperAimingRef.current
        );
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isTouchDevice]);

  // Authentic Brawl Stars Desert / Arena Ground Tiles
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

  // Authentic Layered Leafy Bushes (Brawl Stars Tall Grass)
  const drawBushes = (ctx: CanvasRenderingContext2D, bushes: any[]) => {
    const time = performance.now() * 0.003;

    bushes.forEach(b => {
      ctx.save();

      // Drop shadow for bush cluster
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(b.x + 3, b.y + 5, b.w, b.h);

      // Base deep forest green layer
      ctx.fillStyle = '#0f5132';
      ctx.fillRect(b.x, b.y, b.w, b.h);

      // Layered organic circular leaf puffs
      const clumpStep = 24;
      for (let lx = b.x + 12; lx < b.x + b.w; lx += clumpStep) {
        for (let ly = b.y + 12; ly < b.y + b.h; ly += clumpStep) {
          const sway = Math.sin(time + lx * 0.05 + ly * 0.05) * 2;

          // Mid-tone rich foliage
          ctx.fillStyle = '#16a34a';
          ctx.beginPath();
          ctx.arc(lx + sway, ly, 14, 0, Math.PI * 2);
          ctx.fill();

          // Vibrant lime-green top highlight leaf
          ctx.fillStyle = '#4ade80';
          ctx.beginPath();
          ctx.arc(lx + sway - 2, ly - 3, 9, 0, Math.PI * 2);
          ctx.fill();

          // Occasional yellow flower blossom in bushes
          if ((Math.floor(lx + ly) % 70) < 15) {
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.arc(lx + sway, ly - 2, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(lx + sway, ly - 2, 1.5, 0, Math.PI * 2);
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

      if (fx.type === 'primo_slam') {
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
    const gemImg = assetLoader.getImage('gem');
    const pulseScale = 1 + Math.sin(time * 3) * 0.15;
    ctx.save();
    ctx.scale(pulseScale, pulseScale);
    if (gemImg) {
      ctx.shadowColor = '#c084fc';
      ctx.shadowBlur = 24;
      ctx.drawImage(gemImg, -20, -20, 40, 40);
    } else {
      ctx.fillStyle = '#c084fc';
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
    }
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
    const gemImg = assetLoader.getImage('gem');
    const cubeImg = assetLoader.getImage('power_cube');

    // 1. Purple Gems
    gems.forEach(g => {
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

      if (gemImg) {
        ctx.drawImage(gemImg, -16, -16, 32, 32);
      } else {
        ctx.fillStyle = '#c084fc';
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(14, 0);
        ctx.lineTo(0, 14);
        ctx.lineTo(-14, 0);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    });

    // 2. Emerald Power Cubes
    cubes.forEach(c => {
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

      if (cubeImg) {
        ctx.drawImage(cubeImg, -18, -18, 36, 36);
      } else {
        ctx.fillStyle = '#15803d';
        ctx.fillRect(-14, -14, 28, 28);
      }

      ctx.restore();
    });
  };

  // 3D Isometric Wall Blocks
  const drawWalls = (ctx: CanvasRenderingContext2D, walls: any[]) => {
    walls.forEach(w => {
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

    const cfg = BRAWLERS[b.brawlerId] || BRAWLERS.shelly;
    const brawlerImg = assetLoader.getImage(b.brawlerId);
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

    // 1. Drop shadow (Stays on ground even during jumps)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 18, 24 * (1 - elevateY * 0.005), 11 * (1 - elevateY * 0.005), 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Super Charged Aura (Signature Brawl Stars Glowing Yellow Ring at feet)
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

    // 4. Brawler Sprite Rendering (With Elevation & Walk Animation)
    ctx.save();
    ctx.translate(0, elevateY);
    ctx.scale(jumpScale, jumpScale);

    // Walk Bobbing Motion
    const isMoving = Math.abs(b.vx) > 5 || Math.abs(b.vy) > 5;
    const walkBob = isMoving ? Math.sin(performance.now() * 0.015) * 3 : 0;

    // Directional Horizontal Flip (Facing aim angle)
    const isFacingLeft = Math.cos(b.aimAngle) < 0;
    if (isFacingLeft) {
      ctx.scale(-1, 1);
    }

    const spriteSize = 62;
    if (brawlerImg) {
      ctx.drawImage(
        brawlerImg,
        -spriteSize / 2,
        -spriteSize / 2 - 8 + walkBob,
        spriteSize,
        spriteSize
      );
    } else {
      ctx.fillStyle = cfg.color;
      ctx.beginPath();
      ctx.arc(0, -6 + walkBob, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cfg.name[0], 0, -6 + walkBob);
    }

    ctx.restore(); // Restore sprite transform

    // 5. Star Power & Status Trails:
    if (b.brawlerId === 'colt' && isMoving) {
      // Colt Slick Boots: Golden speed trail
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(-16 + (Math.random() - 0.5) * 6, 16, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.meteorRushTimer > 0 && isMoving) {
      // El Primo Meteor Rush flame sparks
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

    // 7. AUTHENTIC BRAWL STARS HEAD HUD (Health, Ammo, Cubes, Band-Aid badge)
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
      (b.brawlerId === 'shelly' && b.bandAidCooldown <= 0 ? ' [✚]' : '');
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

    if (p.brawlerId === 'brock') {
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
    } else if (p.brawlerId === 'leon') {
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
    } else if (p.brawlerId === 'colt') {
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
    } else if (p.brawlerId === 'spike') {
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
    } else if (p.brawlerId === 'el_primo') {
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

  // Authentic Brawl Stars Aiming Reticle (Normal Mode vs Golden Super Mode)
  const drawAimReticle = (
    ctx: CanvasRenderingContext2D,
    b: BrawlerEntity,
    isSuperMode: boolean
  ) => {
    const cfg = BRAWLERS[b.brawlerId];
    ctx.save();

    if (isSuperMode && b.superCharge >= 100) {
      // === GOLDEN SUPER AIMING MODE ===
      ctx.strokeStyle = '#facc15';
      ctx.fillStyle = '#facc15';
      ctx.shadowColor = '#eab308';
      ctx.shadowBlur = 16;
      ctx.lineWidth = 3;

      if (b.brawlerId === 'el_primo') {
        const targetX = mouseRef.current.worldX;
        const targetY = mouseRef.current.worldY;
        const d = Math.min(380, Math.hypot(targetX - b.x, targetY - b.y));
        const ang = Math.atan2(targetY - b.y, targetX - b.x);
        const landX = b.x + Math.cos(ang) * d;
        const landY = b.y + Math.sin(ang) * d;

        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(landX, landY);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(234, 179, 8, 0.25)';
        ctx.beginPath();
        ctx.arc(landX, landY, 70, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💥', landX, landY);
      } else if (b.brawlerId === 'brock') {
        const targetX = mouseRef.current.worldX;
        const targetY = mouseRef.current.worldY;

        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(targetX, targetY);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.strokeStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(targetX, targetY, 85, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎯', targetX, targetY);
      } else if (b.brawlerId === 'spike') {
        const targetX = mouseRef.current.worldX;
        const targetY = mouseRef.current.worldY;

        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(targetX, targetY);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.strokeStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(targetX, targetY, 90, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (b.brawlerId === 'shelly') {
        ctx.translate(b.x, b.y);
        ctx.rotate(b.aimAngle);
        ctx.beginPath();
        ctx.moveTo(25, 0);
        ctx.lineTo(400, -400 * Math.sin(0.28));
        ctx.moveTo(25, 0);
        ctx.lineTo(400, 400 * Math.sin(0.28));
        ctx.stroke();

        ctx.fillStyle = 'rgba(232, 121, 249, 0.2)';
        ctx.beginPath();
        ctx.moveTo(25, 0);
        ctx.lineTo(400, -400 * Math.sin(0.28));
        ctx.lineTo(400, 400 * Math.sin(0.28));
        ctx.closePath();
        ctx.fill();
      } else if (b.brawlerId === 'colt') {
        ctx.translate(b.x, b.y);
        ctx.rotate(b.aimAngle);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(25, -6);
        ctx.lineTo(580, -6);
        ctx.moveTo(25, 6);
        ctx.lineTo(580, 6);
        ctx.stroke();
      } else if (b.brawlerId === 'leon') {
        ctx.translate(b.x, b.y);
        ctx.strokeStyle = '#06b6d4';
        ctx.fillStyle = 'rgba(6, 182, 212, 0.25)';
        ctx.beginPath();
        ctx.arc(0, 0, 65, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      // === NORMAL ATTACK AIMING MODE ===
      ctx.translate(b.x, b.y);
      ctx.rotate(b.aimAngle);

      const reticleColor = 'rgba(56, 189, 248, 0.6)';
      ctx.strokeStyle = reticleColor;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);

      if (b.brawlerId === 'shelly') {
        const halfAngle = cfg.spreadAngle || 0.28;
        ctx.beginPath();
        ctx.moveTo(25, 0);
        ctx.lineTo(cfg.range, -cfg.range * Math.sin(halfAngle));
        ctx.moveTo(25, 0);
        ctx.lineTo(cfg.range, cfg.range * Math.sin(halfAngle));
        ctx.stroke();

        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(25, 0);
        ctx.lineTo(cfg.range, 0);
        ctx.stroke();
      } else if (b.brawlerId === 'colt') {
        ctx.beginPath();
        ctx.moveTo(25, -4);
        ctx.lineTo(cfg.range, -4);
        ctx.moveTo(25, 4);
        ctx.lineTo(cfg.range, 4);
        ctx.stroke();
      } else if (b.brawlerId === 'brock') {
        ctx.beginPath();
        ctx.moveTo(25, 0);
        ctx.lineTo(cfg.range, 0);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(cfg.range, 0, 18, 0, Math.PI * 2);
        ctx.stroke();
      } else if (b.brawlerId === 'spike') {
        ctx.beginPath();
        ctx.moveTo(25, 0);
        ctx.lineTo(cfg.range, 0);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(cfg.range, 0, 14, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(25, 0);
        ctx.lineTo(cfg.range, 0);
        ctx.stroke();
      }
    }

    ctx.restore();
  };

  // Floating Damage & Healing Numbers
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
  const drawMobileTouchControls = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    myBrawler?: BrawlerEntity,
    isSuperMode: boolean = false
  ) => {
    // 1. Movement Joystick Base (Bottom Left)
    const mBaseX = 110;
    const mBaseY = h - 110;
    const mRadius = 65;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(mBaseX, mBaseY, mRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Movement Stick
    let mStickX = mBaseX;
    let mStickY = mBaseY;
    if (moveJoystickRef.current.active) {
      mStickX = moveJoystickRef.current.curX;
      mStickY = moveJoystickRef.current.curY;
    }
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(mStickX, mStickY, 28, 0, Math.PI * 2);
    ctx.fill();

    // 2. Attack Joystick Base (Bottom Right)
    const aBaseX = w - 110;
    const aBaseY = h - 110;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
    ctx.strokeStyle = isSuperMode ? '#eab308' : '#ef4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(aBaseX, aBaseY, mRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Attack Stick
    let aStickX = aBaseX;
    let aStickY = aBaseY;
    if (aimJoystickRef.current.active) {
      aStickX = aimJoystickRef.current.curX;
      aStickY = aimJoystickRef.current.curY;
    }
    ctx.fillStyle = isSuperMode ? '#eab308' : '#ef4444';
    ctx.beginPath();
    ctx.arc(aStickX, aStickY, 28, 0, Math.PI * 2);
    ctx.fill();

    // 3. Glowing SUPER Button
    const isSuperReady = (myBrawler?.superCharge || 0) >= 100;
    const sBtnX = w - 190;
    const sBtnY = h - 160;

    ctx.save();
    ctx.fillStyle = isSuperMode ? '#fef08a' : isSuperReady ? '#eab308' : '#334155';
    ctx.shadowColor = isSuperReady ? '#eab308' : 'transparent';
    ctx.shadowBlur = isSuperReady ? 22 : 0;
    ctx.beginPath();
    ctx.arc(sBtnX, sBtnY, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = isSuperMode ? 3.5 : 1.5;
    ctx.stroke();

    ctx.fillStyle = isSuperMode ? '#000000' : '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💀', sBtnX, sBtnY);
    ctx.restore();

    // 4. GREEN GADGET BUTTON
    const gCharges = myBrawler?.gadgetCharges || 0;
    const gBtnX = w - 190;
    const gBtnY = h - 80;

    ctx.save();
    ctx.fillStyle = gCharges > 0 ? '#16a34a' : '#334155';
    ctx.shadowColor = gCharges > 0 ? '#22c55e' : 'transparent';
    ctx.shadowBlur = gCharges > 0 ? 14 : 0;
    ctx.beginPath();
    ctx.arc(gBtnX, gBtnY, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#86efac';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`⚡ ${gCharges}`, gBtnX, gBtnY);
    ctx.restore();
  };

  // Touch Event Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const tx = t.clientX - rect.left;
      const ty = t.clientY - rect.top;

      // Left half = Move Joystick
      if (tx < rect.width / 2) {
        moveJoystickRef.current = {
          active: true,
          startX: tx,
          startY: ty,
          curX: tx,
          curY: ty,
        };
      } else {
        // Right half: Check if Super button tapped
        const sBtnX = rect.width - 190;
        const sBtnY = rect.height - 160;
        const gBtnX = rect.width - 190;
        const gBtnY = rect.height - 80;

        if (Math.hypot(tx - sBtnX, ty - sBtnY) < 42) {
          const snap = snapshotRef.current;
          const myBrawler = snap?.brawlers.find(b => b.id === myPlayerIdRef.current);
          if (myBrawler && myBrawler.superCharge >= 100) {
            isSuperAimingRef.current = !isSuperAimingRef.current;
          }
        } else if (Math.hypot(tx - gBtnX, ty - gBtnY) < 35) {
          gadgetTouchRef.current = true;
        } else {
          // Attack Joystick
          aimJoystickRef.current = {
            active: true,
            startX: tx,
            startY: ty,
            curX: tx,
            curY: ty,
          };
        }
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const tx = t.clientX - rect.left;
      const ty = t.clientY - rect.top;

      if (tx < rect.width / 2 && moveJoystickRef.current.active) {
        moveJoystickRef.current.curX = tx;
        moveJoystickRef.current.curY = ty;
      } else if (aimJoystickRef.current.active) {
        aimJoystickRef.current.curX = tx;
        aimJoystickRef.current.curY = ty;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const tx = t.clientX - rect.left;

      if (tx < rect.width / 2) {
        moveJoystickRef.current.active = false;
      } else {
        aimJoystickRef.current.active = false;
      }
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
        className="w-full h-full object-cover block cursor-crosshair"
      />
    </div>
  );
};
