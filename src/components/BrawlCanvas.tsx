import React, { useEffect, useRef, useState } from 'react';
import {
  BrawlSnapshot,
  BrawlPlayerInput,
  BrawlerEntity,
  BRAWLERS,
  BrawlerId,
} from '../types/brawl';
import { MAP_WIDTH, MAP_HEIGHT } from '../game/brawlMaps';

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

  // Smooth Camera Coordinates
  const cameraRef = useRef<{ x: number; y: number }>({ x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 });

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

  // Stable references
  const snapshotRef = useRef<BrawlSnapshot | null>(snapshot);
  snapshotRef.current = snapshot;
  const myPlayerIdRef = useRef<string>(myPlayerId);
  myPlayerIdRef.current = myPlayerId;
  const onSendInputRef = useRef<(input: BrawlPlayerInput) => void>(onSendInput);
  onSendInputRef.current = onSendInput;

  // Detect touch device
  useEffect(() => {
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      setIsTouchDevice(true);
    }
  }, []);

  // Keyboard & Mouse Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code) keysRef.current[e.code.toLowerCase()] = true;
      if (e.key) keysRef.current[e.key.toLowerCase()] = true;
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
      if (e.button === 0) mouseRef.current.isDown = true;
      if (e.button === 2) {
        e.preventDefault();
        mouseRef.current.rightDown = true;
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

      const isSuper = !!(keys['space'] || keys[' '] || mouseRef.current.rightDown || superTouchRef.current);
      const isAttack = !!(mouseRef.current.isDown || (aimJoystickRef.current.active && Math.hypot(aimJoystickRef.current.curX - aimJoystickRef.current.startX, aimJoystickRef.current.curY - aimJoystickRef.current.startY) > 25));

      const input: BrawlPlayerInput = {
        moveX,
        moveY,
        aimAngle,
        attack: isAttack,
        superAttack: isSuper,
        superTargetX: mouseRef.current.worldX,
        superTargetY: mouseRef.current.worldY,
        emote: keys['keye'] || keys['e'] ? '👑' : undefined,
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

      const cam = cameraRef.current;

      // 1. CLEAR & SAVE WORLD MATRIX
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2 - cam.x, canvas.height / 2 - cam.y);

      // 2. DRAW GROUND & TILES
      drawGroundTiles(ctx);

      if (snap) {
        // 3. DRAW BUSHES (Background layer)
        drawBushes(ctx, snap.bushes);

        // 4. DRAW THORN FIELDS (Spike Super)
        drawThornFields(ctx, snap.thornFields);

        // 5. DRAW GEM MINE (Gem Grab)
        if (snap.gemMine) {
          drawGemMine(ctx, snap.gemMine);
        }

        // 6. DRAW POWER CUBE BOXES
        drawBoxes(ctx, snap.boxes);

        // 7. DRAW DROPPED GEMS & CUBES
        drawPickups(ctx, snap.gems, snap.powerCubes);

        // 8. DRAW WALLS
        drawWalls(ctx, snap.walls);

        // 9. DRAW BRAWLERS
        snap.brawlers.forEach(b => {
          drawBrawler(ctx, b, b.id === myId, myBrawler);
        });

        // 10. DRAW PROJECTILES
        snap.projectiles.forEach(p => {
          drawProjectile(ctx, p);
        });

        // 11. DRAW POISON GAS (Showdown)
        if (snap.poisonGas?.isActive) {
          drawPoisonGas(ctx, snap.poisonGas.inset);
        }

        // 12. DRAW AIM RETICLE FOR LOCAL BRAWLER
        if (myBrawler && myBrawler.isAlive) {
          drawAimReticle(ctx, myBrawler);
        }

        // 13. DRAW FLOATING DAMAGE NUMBERS
        drawFloatingNumbers(ctx, snap.floatingNumbers);
      }

      ctx.restore(); // Restore world translation

      // 14. MOBILE ON-SCREEN CONTROLS (Screen space overlay)
      if (isTouchDevice) {
        drawMobileTouchControls(ctx, canvas.width, canvas.height, snap?.brawlers.find(b => b.id === myId));
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isTouchDevice]);

  // Ground Tiles Drawing
  const drawGroundTiles = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#1e1b2e'; // Dark desert / sci-fi rock ground
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Subtle checkered arena grid
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    const tileSize = 80;
    for (let x = 0; x < MAP_WIDTH; x += tileSize * 2) {
      for (let y = 0; y < MAP_HEIGHT; y += tileSize * 2) {
        ctx.fillRect(x, y, tileSize, tileSize);
        ctx.fillRect(x + tileSize, y + tileSize, tileSize, tileSize);
      }
    }

    // Outer border hazard line
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, MAP_WIDTH - 80, MAP_HEIGHT - 80);
  };

  // Bushes (Tall grass for stealth)
  const drawBushes = (ctx: CanvasRenderingContext2D, bushes: any[]) => {
    bushes.forEach(b => {
      ctx.save();
      ctx.fillStyle = '#15803d'; // Rich green bush
      ctx.fillRect(b.x, b.y, b.w, b.h);

      // Bush texture leaves
      ctx.fillStyle = '#22c55e';
      const leafStep = 25;
      for (let lx = b.x + 8; lx < b.x + b.w; lx += leafStep) {
        for (let ly = b.y + 8; ly < b.y + b.h; ly += leafStep) {
          ctx.beginPath();
          ctx.arc(lx, ly, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    });
  };

  // Thorn Fields (Spike Super)
  const drawThornFields = (ctx: CanvasRenderingContext2D, fields: any[]) => {
    const time = performance.now() * 0.005;
    fields.forEach(f => {
      ctx.save();
      ctx.translate(f.x, f.y);

      ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, f.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.lineDashOffset = -time * 20;
      ctx.stroke();

      ctx.restore();
    });
  };

  // Gem Mine
  const drawGemMine = (ctx: CanvasRenderingContext2D, mine: any) => {
    const time = performance.now() * 0.003;
    ctx.save();
    ctx.translate(mine.x, mine.y);

    // Mine pit
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, 0, 45, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Pulsing Gem Crystal
    const pulse = 14 + Math.sin(time * 4) * 3;
    ctx.fillStyle = '#c084fc';
    ctx.shadowColor = '#c084fc';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  // Power Cube Boxes
  const drawBoxes = (ctx: CanvasRenderingContext2D, boxes: any[]) => {
    boxes.forEach(b => {
      ctx.save();
      ctx.fillStyle = '#92400e'; // Wooden chest
      ctx.fillRect(b.x, b.y, b.w, b.h);

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(b.x, b.y, b.w, b.h);

      // Metal bands & skull symbol
      ctx.fillStyle = '#d97706';
      ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);

      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📦', b.x + b.w / 2, b.y + b.h / 2);

      // Health bar above box
      const hpPct = Math.max(0, b.hp / b.maxHp);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(b.x, b.y - 12, b.w, 6);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(b.x, b.y - 12, b.w * hpPct, 6);

      ctx.restore();
    });
  };

  // Pickups (Gems & Power Cubes)
  const drawPickups = (ctx: CanvasRenderingContext2D, gems: any[], cubes: any[]) => {
    const time = performance.now() * 0.005;

    // Gems
    gems.forEach(g => {
      ctx.save();
      ctx.translate(g.x, g.y + Math.sin(time * 3) * 3);
      ctx.fillStyle = '#c084fc';
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, g.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Power Cubes
    cubes.forEach(c => {
      ctx.save();
      ctx.translate(c.x, c.y + Math.sin(time * 3 + 1) * 3);
      ctx.fillStyle = '#22c55e';
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 12;
      ctx.fillRect(-c.radius, -c.radius, c.radius * 2, c.radius * 2);
      ctx.restore();
    });
  };

  // Walls
  const drawWalls = (ctx: CanvasRenderingContext2D, walls: any[]) => {
    walls.forEach(w => {
      ctx.save();
      if (w.isDestructible) {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 2;
        ctx.strokeRect(w.x, w.y, w.w, w.h);
      } else {
        ctx.fillStyle = '#334155';
        ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2;
        ctx.strokeRect(w.x, w.y, w.w, w.h);
      }
      ctx.restore();
    });
  };

  // Brawler Entity
  const drawBrawler = (
    ctx: CanvasRenderingContext2D,
    b: BrawlerEntity,
    isMe: boolean,
    localBrawler?: BrawlerEntity
  ) => {
    if (!b.isAlive) return;

    // Bush visibility logic:
    // If enemy is in bush and NOT visible to enemies: don't render!
    if (!isMe && b.isInBush && !b.isVisibleToEnemies) {
      // If local player is in the same bush or close, show outline
      if (localBrawler && Math.hypot(localBrawler.x - b.x, localBrawler.y - b.y) > 75) {
        return;
      }
    }

    const cfg = BRAWLERS[b.brawlerId] || BRAWLERS.shelly;

    ctx.save();
    ctx.translate(b.x, b.y);

    // Alpha for bush translucency or Leon invisibility
    if (b.invisibilityTimer > 0) {
      if (isMe) ctx.globalAlpha = 0.45;
      else return; // Completely hidden from enemies
    } else if (b.isInBush) {
      ctx.globalAlpha = isMe ? 0.55 : 0.4;
    }

    // 1. Shadow underneath
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 16, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Aim direction indicator (Foot ring)
    ctx.save();
    ctx.rotate(b.aimAngle);
    ctx.fillStyle = isMe ? '#38bdf8' : b.team === 0 ? '#3b82f6' : '#ef4444';
    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(16, -6);
    ctx.lineTo(16, 6);
    ctx.fill();
    ctx.restore();

    // 3. Body Circle
    ctx.fillStyle = cfg.color;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 4. Brawler Initial / Icon
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.name[0], 0, 0);

    // 5. Active Emote Pin
    if (b.activeEmote) {
      ctx.font = '24px sans-serif';
      ctx.fillText(b.activeEmote, 0, -55);
    }

    ctx.restore();

    // 6. HEALTH & AMMO HUD ABOVE HEAD (Outside brawler translation)
    ctx.save();
    ctx.translate(b.x, b.y);

    // Player Name
    ctx.font = 'bold 12px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isMe ? '#f8fafc' : '#cbd5e1';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    ctx.fillText(
      b.name + (b.powerCubes > 0 ? ` [🟩${b.powerCubes}]` : '') + (b.gemsCarried > 0 ? ` [💎${b.gemsCarried}]` : ''),
      0,
      -34
    );

    // Health Bar
    const hpWidth = 52;
    const hpHeight = 6;
    const hpPct = Math.max(0, b.hp / b.maxHp);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-hpWidth / 2, -26, hpWidth, hpHeight);
    ctx.fillStyle = isMe ? '#22c55e' : b.team === 0 ? '#3b82f6' : '#ef4444';
    ctx.fillRect(-hpWidth / 2, -26, hpWidth * hpPct, hpHeight);

    // 3 Ammo Segments
    const ammoWidth = (hpWidth - 4) / 3;
    for (let i = 0; i < 3; i++) {
      const segPct = Math.max(0, Math.min(1, b.ammo - i));
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-hpWidth / 2 + i * (ammoWidth + 2), -18, ammoWidth, 3);
      ctx.fillStyle = isMe ? '#f59e0b' : '#94a3b8';
      ctx.fillRect(-hpWidth / 2 + i * (ammoWidth + 2), -18, ammoWidth * segPct, 3);
    }

    ctx.restore();
  };

  // Projectile
  const drawProjectile = (ctx: CanvasRenderingContext2D, p: any) => {
    ctx.save();
    ctx.translate(p.x, p.y);

    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.isSuper ? 16 : 8;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, p.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  // Poison Gas
  const drawPoisonGas = (ctx: CanvasRenderingContext2D, inset: number) => {
    ctx.save();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 20;

    // 4 Border strips
    ctx.fillRect(0, 0, MAP_WIDTH, inset);
    ctx.fillRect(0, MAP_HEIGHT - inset, MAP_WIDTH, inset);
    ctx.fillRect(0, inset, inset, MAP_HEIGHT - inset * 2);
    ctx.fillRect(MAP_WIDTH - inset, inset, inset, MAP_HEIGHT - inset * 2);

    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 6;
    ctx.strokeRect(inset, inset, MAP_WIDTH - inset * 2, MAP_HEIGHT - inset * 2);
    ctx.restore();
  };

  // Aim Reticle for Local Brawler
  const drawAimReticle = (ctx: CanvasRenderingContext2D, b: BrawlerEntity) => {
    const cfg = BRAWLERS[b.brawlerId];
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.aimAngle);

    // Aim Laser trajectory line
    ctx.strokeStyle = b.superCharge >= 100 ? 'rgba(234, 179, 8, 0.6)' : 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(25, 0);
    ctx.lineTo(cfg.range, 0);
    ctx.stroke();

    // Spread cone if shotgun (Shelly)
    if (cfg.spreadAngle > 0.1) {
      ctx.beginPath();
      ctx.moveTo(25, 0);
      ctx.lineTo(cfg.range, -cfg.range * Math.tan(cfg.spreadAngle / 2));
      ctx.moveTo(25, 0);
      ctx.lineTo(cfg.range, cfg.range * Math.tan(cfg.spreadAngle / 2));
      ctx.stroke();
    }

    ctx.restore();
  };

  // Floating Numbers
  const drawFloatingNumbers = (ctx: CanvasRenderingContext2D, numbers: any[]) => {
    numbers.forEach(fn => {
      ctx.save();
      ctx.font = 'bold 15px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = fn.color;
      ctx.shadowColor = fn.color;
      ctx.shadowBlur = 8;
      ctx.globalAlpha = Math.max(0, Math.min(1, fn.alpha));
      ctx.fillText(fn.text, fn.x, fn.y);
      ctx.restore();
    });
  };

  // Mobile Touch Virtual Joysticks (Rendered in screen space)
  const drawMobileTouchControls = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    myBrawler?: BrawlerEntity
  ) => {
    // 1. Movement Joystick Base (Bottom Left)
    const mBaseX = 110;
    const mBaseY = h - 110;
    const mRadius = 65;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
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

    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.strokeStyle = '#ef4444';
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
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(aStickX, aStickY, 28, 0, Math.PI * 2);
    ctx.fill();

    // 3. Glowing SUPER Button
    const isSuperReady = (myBrawler?.superCharge || 0) >= 100;
    const sBtnX = w - 190;
    const sBtnY = h - 160;

    ctx.save();
    ctx.fillStyle = isSuperReady ? '#eab308' : '#334155';
    ctx.shadowColor = isSuperReady ? '#eab308' : 'transparent';
    ctx.shadowBlur = isSuperReady ? 20 : 0;
    ctx.beginPath();
    ctx.arc(sBtnX, sBtnY, 32, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💀', sBtnX, sBtnY);
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
        if (Math.hypot(tx - sBtnX, ty - sBtnY) < 40) {
          superTouchRef.current = true;
          setTimeout(() => (superTouchRef.current = false), 200);
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
        width={window.innerWidth || 1280}
        height={window.innerHeight || 720}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="w-full h-full object-cover block cursor-crosshair"
      />
    </div>
  );
};
