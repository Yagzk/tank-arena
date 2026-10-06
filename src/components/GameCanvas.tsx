import React, { useEffect, useRef } from 'react';
import { GameStateSnapshot, PlayerInput, TANK_COLORS, Tank, Bullet, Mine, PowerUp, Wall, ExplosiveBarrel, BoostPad, Portal, FloatingText } from '../types/game';
import { ARENA_WIDTH, ARENA_HEIGHT } from '../game/mapGenerator';

interface GameCanvasProps {
  snapshot: GameStateSnapshot | null;
  myPlayerId: string;
  onSendInput: (input: PlayerInput) => void;
  isHost: boolean;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  snapshot,
  myPlayerId,
  onSendInput,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Screen shake
  const shakeRef = useRef<number>(0);

  // Input states
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const mouseRef = useRef<{
    x: number;
    y: number;
    isDown: boolean;
    rightDown: boolean;
    middleDown: boolean;
  }>({
    x: ARENA_WIDTH / 2,
    y: ARENA_HEIGHT / 2,
    isDown: false,
    rightDown: false,
    middleDown: false,
  });

  // Stable references
  const snapshotRef = useRef<GameStateSnapshot | null>(snapshot);
  snapshotRef.current = snapshot;

  const myPlayerIdRef = useRef<string>(myPlayerId);
  myPlayerIdRef.current = myPlayerId;

  const onSendInputRef = useRef<(input: PlayerInput) => void>(onSendInput);
  onSendInputRef.current = onSendInput;

  // Handle inputs and send at 60fps
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
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = ARENA_WIDTH / (rect.width || 1);
      const scaleY = ARENA_HEIGHT / (rect.height || 1);
      mouseRef.current.x = (e.clientX - rect.left) * scaleX;
      mouseRef.current.y = (e.clientY - rect.top) * scaleY;
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) mouseRef.current.isDown = true;
      if (e.button === 1) mouseRef.current.middleDown = true;
      if (e.button === 2) {
        e.preventDefault();
        mouseRef.current.rightDown = true;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) mouseRef.current.isDown = false;
      if (e.button === 1) mouseRef.current.middleDown = false;
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

    // Send input loop
    const inputInterval = setInterval(() => {
      const keys = keysRef.current;
      const currentSnap = snapshotRef.current;
      const myId = myPlayerIdRef.current;
      const myTank = currentSnap?.tanks.find(t => t.id === myId);

      let aimAngle = 0;
      if (myTank) {
        aimAngle = Math.atan2(mouseRef.current.y - myTank.y, mouseRef.current.x - myTank.x);
      }

      let moveX = 0;
      let moveY = 0;
      if (keys['keyw'] || keys['w'] || keys['arrowup']) moveY -= 1;
      if (keys['keys'] || keys['s'] || keys['arrowdown']) moveY += 1;
      if (keys['keya'] || keys['a'] || keys['arrowleft']) moveX -= 1;
      if (keys['keyd'] || keys['d'] || keys['arrowright']) moveX += 1;

      const isDashPressed = !!(keys['space'] || keys[' '] || keys['shiftleft'] || keys['shift'] || keys['keyf'] || keys['f']);
      const isEmpPressed = !!(keys['keyq'] || keys['q'] || mouseRef.current.middleDown || keys['keyc'] || keys['c']);
      const isShootPressed = !!(mouseRef.current.isDown);
      const isMinePressed = !!(mouseRef.current.rightDown || keys['keye'] || keys['e']);

      const input: PlayerInput = {
        moveX,
        moveY,
        moveForward: moveY < 0,
        moveBackward: moveY > 0,
        turnLeft: moveX < 0,
        turnRight: moveX > 0,
        aimAngle,
        shoot: isShootPressed,
        placeMine: isMinePressed,
        dash: isDashPressed,
        emp: isEmpPressed,
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

  // Main Render Loop
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      if (shakeRef.current > 0) {
        const sx = (Math.random() - 0.5) * shakeRef.current;
        const sy = (Math.random() - 0.5) * shakeRef.current;
        ctx.translate(sx, sy);
        shakeRef.current = Math.max(0, shakeRef.current - 0.5);
      }

      const snap = snapshotRef.current;
      const biome = snap?.biome || 'cyber';

      // 1. Draw Biome Background
      drawBiomeBackground(ctx, biome);

      if (snap) {
        // 2. Draw Speed Boost Pads
        drawBoostPads(ctx, snap.boostPads);

        // 3. Draw Portals
        drawPortals(ctx, snap.portals);

        // 4. Draw Walls & Crates
        drawWalls(ctx, snap.walls, biome);

        // 5. Draw Explosive Barrels
        drawBarrels(ctx, snap.barrels);

        // 6. Draw PowerUps
        drawPowerups(ctx, snap.powerups);

        // 7. Draw Mines
        drawMines(ctx, snap.mines);

        // 8. Draw Tanks
        snap.tanks.forEach(tank => {
          drawTank(ctx, tank, tank.id === myPlayerIdRef.current);
        });

        // 9. Draw Bullets
        snap.bullets.forEach(bullet => {
          drawBullet(ctx, bullet);
        });

        // 10. Draw Sudden Death Zone Border
        if (snap.suddenDeath?.isActive) {
          drawSuddenDeathZone(ctx, snap.suddenDeath.inset);
        }

        // 11. Draw Floating Combat Text
        drawFloatingTexts(ctx, snap.floatingTexts);

        // 12. Overlays
        drawPhaseOverlay(ctx, snap);
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Biome background drawing
  const drawBiomeBackground = (ctx: CanvasRenderingContext2D, biome: string) => {
    if (biome === 'magma') {
      ctx.fillStyle = '#0f0505';
      ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

      ctx.strokeStyle = 'rgba(239, 68, 68, 0.15)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      ctx.beginPath();
      for (let x = 0; x <= ARENA_WIDTH; x += gridSize) {
        ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_HEIGHT);
      }
      for (let y = 0; y <= ARENA_HEIGHT; y += gridSize) {
        ctx.moveTo(0, y); ctx.lineTo(ARENA_WIDTH, y);
      }
      ctx.stroke();

      // Reactor core aura in center
      const time = performance.now() * 0.002;
      const pulse = 130 + Math.sin(time) * 12;
      const grad = ctx.createRadialGradient(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 20, ARENA_WIDTH / 2, ARENA_HEIGHT / 2, pulse);
      grad.addColorStop(0, 'rgba(249, 115, 22, 0.22)');
      grad.addColorStop(1, 'rgba(249, 115, 22, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, pulse, 0, Math.PI * 2);
      ctx.fill();

    } else if (biome === 'frost') {
      ctx.fillStyle = '#050c18';
      ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      ctx.beginPath();
      for (let x = 0; x <= ARENA_WIDTH; x += gridSize) {
        ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_HEIGHT);
      }
      for (let y = 0; y <= ARENA_HEIGHT; y += gridSize) {
        ctx.moveTo(0, y); ctx.lineTo(ARENA_WIDTH, y);
      }
      ctx.stroke();

      // Icy central arena ring
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 140, 0, Math.PI * 2);
      ctx.stroke();

    } else {
      // Cyber core default
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

      ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      ctx.beginPath();
      for (let x = 0; x <= ARENA_WIDTH; x += gridSize) {
        ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_HEIGHT);
      }
      for (let y = 0; y <= ARENA_HEIGHT; y += gridSize) {
        ctx.moveTo(0, y); ctx.lineTo(ARENA_WIDTH, y);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(6, 182, 212, 0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 140, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  // Draw Boost Pads
  const drawBoostPads = (ctx: CanvasRenderingContext2D, pads: BoostPad[]) => {
    const time = performance.now() * 0.005;
    pads.forEach(pad => {
      ctx.save();
      ctx.translate(pad.x + pad.w / 2, pad.y + pad.h / 2);

      ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.fillRect(-pad.w / 2, -pad.h / 2, pad.w, pad.h);
      ctx.strokeRect(-pad.w / 2, -pad.h / 2, pad.w, pad.h);

      // Pulsing chevron
      const offset = (time * 15) % (pad.w / 2);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const cx = (pad.dirX * offset);
      ctx.moveTo(cx - 6, -8);
      ctx.lineTo(cx + 6, 0);
      ctx.lineTo(cx - 6, 8);
      ctx.stroke();

      ctx.restore();
    });
  };

  // Draw Portals
  const drawPortals = (ctx: CanvasRenderingContext2D, portals: Portal[]) => {
    const time = performance.now() * 0.003;
    portals.forEach(portal => {
      ctx.save();
      ctx.translate(portal.x, portal.y);

      // Vortex ring
      ctx.strokeStyle = portal.color;
      ctx.shadowColor = portal.color;
      ctx.shadowBlur = 18;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, portal.radius, 0, Math.PI * 2);
      ctx.stroke();

      // Spinning spiral inside
      ctx.rotate(time * 3);
      ctx.fillStyle = portal.color + '40';
      ctx.beginPath();
      ctx.ellipse(0, 0, portal.radius * 0.7, portal.radius * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  };

  // Draw Explosive Barrels
  const drawBarrels = (ctx: CanvasRenderingContext2D, barrels: ExplosiveBarrel[]) => {
    barrels.forEach(b => {
      ctx.save();
      ctx.translate(b.x, b.y);

      // Red barrel body
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
      ctx.fill();

      // Hazard rim
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Hazard warning skull / flame symbol
      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☣', 0, 0);

      ctx.restore();
    });
  };

  // Draw Walls & Crates
  const drawWalls = (ctx: CanvasRenderingContext2D, walls: Wall[], biome: string) => {
    walls.forEach(wall => {
      if (wall.isDestructible) {
        ctx.save();
        if (biome === 'frost') {
          ctx.fillStyle = '#0e7490';
          ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
        } else {
          ctx.fillStyle = '#78350f';
          ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
          ctx.strokeStyle = '#b45309';
          ctx.lineWidth = 2;
          ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
          ctx.strokeStyle = '#92400e';
          ctx.beginPath();
          ctx.moveTo(wall.x, wall.y); ctx.lineTo(wall.x + wall.w, wall.y + wall.h);
          ctx.moveTo(wall.x + wall.w, wall.y); ctx.lineTo(wall.x, wall.y + wall.h);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(wall.x, wall.y, wall.w, wall.h);

        const edgeColor = biome === 'magma' ? '#f97316' : biome === 'frost' ? '#38bdf8' : '#06b6d4';
        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(wall.x + 1, wall.y + 1, wall.w - 2, wall.h - 2);

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(wall.x + 3, wall.y + 3, wall.w - 6, wall.h - 6);
        ctx.restore();
      }
    });
  };

  // Draw Sudden Death Zone Border
  const drawSuddenDeathZone = (ctx: CanvasRenderingContext2D, inset: number) => {
    ctx.save();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 15;
    ctx.strokeRect(inset, inset, ARENA_WIDTH - inset * 2, ARENA_HEIGHT - inset * 2);

    // Hazard striped border
    ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
    ctx.fillRect(0, 0, ARENA_WIDTH, inset); // Top
    ctx.fillRect(0, ARENA_HEIGHT - inset, ARENA_WIDTH, inset); // Bottom
    ctx.fillRect(0, inset, inset, ARENA_HEIGHT - inset * 2); // Left
    ctx.fillRect(ARENA_WIDTH - inset, inset, inset, ARENA_HEIGHT - inset * 2); // Right
    ctx.restore();
  };

  // Draw Powerups
  const drawPowerups = (ctx: CanvasRenderingContext2D, powerups: PowerUp[]) => {
    const time = performance.now() * 0.004;

    powerups.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      const pulse = Math.sin(time * 3) * 2;
      const r = p.radius + pulse;

      ctx.shadowBlur = 15;
      let color = '#38bdf8';
      let icon = '⚡';

      if (p.type === 'shield') { color = '#06b6d4'; icon = '🛡️'; }
      else if (p.type === 'speed') { color = '#facc15'; icon = '🚀'; }
      else if (p.type === 'triple') { color = '#fb923c'; icon = '💥'; }
      else if (p.type === 'laser') { color = '#f43f5e'; icon = '⚡'; }
      else if (p.type === 'homing') { color = '#f59e0b'; icon = '🎯'; }
      else if (p.type === 'ammo') { color = '#4ade80'; icon = '🔋'; }

      ctx.shadowColor = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fill();

      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, 0, 0);

      ctx.restore();
    });
  };

  // Draw Mines
  const drawMines = (ctx: CanvasRenderingContext2D, mines: Mine[]) => {
    const time = performance.now() * 0.006;
    mines.forEach(mine => {
      ctx.save();
      ctx.translate(mine.x, mine.y);

      ctx.fillStyle = '#1e1b4b';
      ctx.beginPath();
      ctx.arc(0, 0, mine.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = mine.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      const isArmed = mine.armTimer <= 0;
      const ledColor = isArmed ? (Math.sin(time * 8) > 0 ? '#ef4444' : '#7f1d1d') : '#38bdf8';
      ctx.fillStyle = ledColor;
      ctx.shadowColor = ledColor;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  };

  // Draw Tank
  const drawTank = (ctx: CanvasRenderingContext2D, tank: Tank, isMe: boolean) => {
    if (!tank.isAlive) {
      ctx.save();
      ctx.translate(tank.x, tank.y);
      ctx.rotate(tank.angle);
      ctx.fillStyle = '#262626';
      ctx.fillRect(-14, -10, 28, 20);
      ctx.strokeStyle = '#404040';
      ctx.strokeRect(-14, -10, 28, 20);
      ctx.restore();
      return;
    }

    const colorConfig = TANK_COLORS[tank.color] || TANK_COLORS.cyan;

    ctx.save();
    ctx.translate(tank.x, tank.y);

    // Energy Shield bubble
    if (tank.shield) {
      ctx.save();
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.85)';
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(6, 182, 212, 0.15)';
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Dash glow ring
    if (tank.isDashing) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 24;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Local player indicator
    if (isMe) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 1. CHASSIS
    ctx.save();
    ctx.rotate(tank.angle);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-17, -15, 34, 7);
    ctx.fillRect(-17, 8, 34, 7);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(-17, -15, 34, 7);
    ctx.strokeRect(-17, 8, 34, 7);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-14, -9, 28, 18);

    ctx.fillStyle = colorConfig.primary;
    ctx.shadowColor = colorConfig.glow;
    ctx.shadowBlur = 10;
    ctx.fillRect(-8, -6, 16, 12);
    ctx.shadowBlur = 0;
    ctx.restore();

    // 2. TURRET
    ctx.save();
    ctx.rotate(tank.turretAngle);

    const barrelLength = tank.laserShotTimer > 0 ? 30 : 25;
    const barrelWidth = tank.tripleShotTimer > 0 ? 8 : 5;

    ctx.fillStyle = '#334155';
    ctx.fillRect(0, -barrelWidth / 2, barrelLength, barrelWidth);

    if (tank.laserShotTimer > 0) {
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(barrelLength - 6, -barrelWidth / 2, 6, barrelWidth);
    } else if (tank.homingShotTimer > 0) {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(barrelLength - 5, -barrelWidth / 2, 5, barrelWidth);
    }

    ctx.fillStyle = colorConfig.secondary;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore(); // Exit tank translation

    // 3. TAG & BARS
    ctx.save();
    ctx.font = 'bold 12px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isMe ? '#f8fafc' : '#cbd5e1';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    ctx.fillText(tank.name + (tank.isBot ? ' [BOT]' : ''), tank.x, tank.y - 32);

    // Ammo dots
    const ammoCount = Math.floor(tank.ammo);
    const startX = tank.x - 16;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < ammoCount ? colorConfig.primary : '#475569';
      ctx.beginPath();
      ctx.arc(startX + i * 8, tank.y - 23, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dash ready bar if local player
    if (isMe) {
      const dashReady = tank.dashCooldown <= 0;
      ctx.fillStyle = dashReady ? '#38bdf8' : '#334155';
      const w = dashReady ? 32 : Math.max(2, (1 - tank.dashCooldown / 2.8) * 32);
      ctx.fillRect(tank.x - 16, tank.y + 24, w, 3);
    }

    ctx.restore();
  };

  // Draw Bullet
  const drawBullet = (ctx: CanvasRenderingContext2D, bullet: Bullet) => {
    ctx.save();
    ctx.translate(bullet.x, bullet.y);

    if (bullet.isLaser) {
      ctx.fillStyle = '#f43f5e';
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(0, 0, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, bullet.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (bullet.isHoming) {
      ctx.fillStyle = '#f59e0b';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(0, 0, bullet.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = bullet.color;
      ctx.shadowColor = bullet.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, bullet.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  // Draw Floating Combat Text
  const drawFloatingTexts = (ctx: CanvasRenderingContext2D, texts: FloatingText[]) => {
    texts.forEach(ft => {
      ctx.save();
      ctx.font = 'bold 14px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = ft.color;
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 8;
      ctx.globalAlpha = Math.max(0, Math.min(1, ft.alpha));
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });
  };

  // Draw overlays
  const drawPhaseOverlay = (ctx: CanvasRenderingContext2D, state: GameStateSnapshot) => {
    if (state.phase === 'starting') {
      const count = Math.ceil(state.roundTimer);
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

      ctx.font = 'bold 80px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#0284c7';
      ctx.shadowBlur = 25;

      const text = count > 0 ? `${count}` : 'ATEŞ!';
      ctx.fillText(text, ARENA_WIDTH / 2, ARENA_HEIGHT / 2);

      ctx.font = '20px Orbitron, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`ROUND ${state.round} / ${state.maxRounds}`, ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 70);
      ctx.restore();

    } else if (state.phase === 'round_end') {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

      ctx.font = 'bold 50px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const winner = state.tanks.find(t => t.id === state.roundWinnerId);
      if (winner) {
        ctx.fillStyle = TANK_COLORS[winner.color]?.primary || '#eab308';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 20;
        ctx.fillText(`👑 ${winner.name.toUpperCase()} KAZANDI!`, ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 20);
      } else {
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('BERABERE!', ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 20);
      }

      ctx.font = '18px Rajdhani, sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(`Sonraki round hazırlanıyor...`, ARENA_WIDTH / 2, ARENA_HEIGHT / 2 + 40);
      ctx.restore();
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center p-2 select-none overflow-hidden"
    >
      <div className="relative rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-800 bg-slate-950 aspect-[3/2] max-h-[88vh] max-w-full">
        <canvas
          ref={canvasRef}
          width={ARENA_WIDTH}
          height={ARENA_HEIGHT}
          className="w-full h-full object-contain cursor-crosshair block"
        />
      </div>
    </div>
  );
};
