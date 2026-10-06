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
      const isAttack = !!(
        mouseRef.current.isDown ||
        (aimJoystickRef.current.active &&
          Math.hypot(
            aimJoystickRef.current.curX - aimJoystickRef.current.startX,
            aimJoystickRef.current.curY - aimJoystickRef.current.startY
          ) > 25)
      );

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

  // Thorn Fields (Spike Super)
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
      ctx.fillRect(barX, barY, barW, barH);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);

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
        // Fallback polished diamond
        ctx.fillStyle = '#c084fc';
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(14, 0);
        ctx.lineTo(0, 14);
        ctx.lineTo(-14, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
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
        // Fallback 3D cube
        ctx.fillStyle = '#15803d';
        ctx.fillRect(-14, -14, 28, 28);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(-14, -14, 28, 16);
        ctx.strokeStyle = '#86efac';
        ctx.lineWidth = 2;
        ctx.strokeRect(-14, -14, 28, 28);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡', 0, 0);
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

  // Authentic Brawler Rendering with Real Transparent Sprites
  const drawBrawler = (
    ctx: CanvasRenderingContext2D,
    b: BrawlerEntity,
    isMe: boolean,
    localBrawler?: BrawlerEntity
  ) => {
    if (!b.isAlive) return;

    // Bush visibility logic:
    // If enemy is inside bush and not firing / revealed, hide unless local player is close (< 85px)
    if (!isMe && b.isInBush && !b.isVisibleToEnemies) {
      if (localBrawler && Math.hypot(localBrawler.x - b.x, localBrawler.y - b.y) > 85) {
        return;
      }
    }

    const cfg = BRAWLERS[b.brawlerId] || BRAWLERS.shelly;
    const brawlerImg = assetLoader.getImage(b.brawlerId);
    const time = performance.now() * 0.005;

    // Handle El Primo airborne Super leap
    let elevateY = 0;
    let jumpScale = 1;
    if (b.brawlerId === 'el_primo' && b.isJumping) {
      const p = b.jumpProgress || 0;
      elevateY = -Math.sin(p * Math.PI) * 75;
      jumpScale = 1 + Math.sin(p * Math.PI) * 0.4;
    }

    ctx.save();
    ctx.translate(b.x, b.y);

    // Stealth / Bush Alpha
    if (b.invisibilityTimer > 0) {
      if (isMe) ctx.globalAlpha = 0.45;
      else return; // Fully invisible to enemies
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
      ctx.shadowBlur = 14;
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

    const spriteSize = 60;
    if (brawlerImg) {
      ctx.drawImage(
        brawlerImg,
        -spriteSize / 2,
        -spriteSize / 2 - 8 + walkBob,
        spriteSize,
        spriteSize
      );
    } else {
      // Fallback stylized hero circle
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

    // 5. Active Emote Pin
    if (b.activeEmote) {
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.activeEmote, 0, -62 + elevateY);
    }

    ctx.restore(); // Restore brawler world transform

    // 6. AUTHENTIC BRAWL STARS HEAD HUD (Health, Ammo, Cubes)
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
      (b.gemsCarried > 0 ? ` [💎${b.gemsCarried}]` : '');
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
      // Brock's Guided Rocket with Flame Exhaust
      ctx.fillStyle = '#f59e0b';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = p.isSuper ? 20 : 12;

      // Rocket body
      ctx.fillRect(-12, -4, 20, 8);
      // Rocket nose cone
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
      // Leon's Spinning Shuriken Blades
      const spin = performance.now() * 0.02;
      ctx.rotate(spin);
      ctx.fillStyle = '#06b6d4';
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 10;

      // 4-Point Shuriken
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(8, -2);
        ctx.lineTo(14, 0);
        ctx.lineTo(8, 2);
        ctx.closePath();
        ctx.fill();
      }
    } else if (p.brawlerId === 'colt') {
      // Colt's High-Velocity Neon Laser Tracers
      ctx.fillStyle = p.isSuper ? '#fbbf24' : '#38bdf8';
      ctx.shadowColor = p.isSuper ? '#f59e0b' : '#0284c7';
      ctx.shadowBlur = 14;

      // Elongated tracer bullet
      const bLen = p.isSuper ? 28 : 18;
      ctx.beginPath();
      ctx.ellipse(0, 0, bLen, p.radius, 0, 0, Math.PI * 2);
      ctx.fill();

      // Bright white-hot center core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(2, 0, bLen * 0.6, p.radius * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.brawlerId === 'spike') {
      // Spike's Cactus Bomb / Needle
      ctx.fillStyle = '#10b981';
      ctx.shadowColor = '#059669';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // Thorns sticking out
      ctx.fillStyle = '#047857';
      for (let i = 0; i < 6; i++) {
        const thAng = (i * Math.PI) / 3;
        const tx = Math.cos(thAng) * (p.radius + 3);
        const ty = Math.sin(thAng) * (p.radius + 3);
        ctx.beginPath();
        ctx.arc(tx, ty, 2, 0, Math.PI * 2);
        ctx.fill();
      }
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

    // 4 Border strips
    ctx.fillRect(0, 0, MAP_WIDTH, inset);
    ctx.fillRect(0, MAP_HEIGHT - inset, MAP_WIDTH, inset);
    ctx.fillRect(0, inset, inset, MAP_HEIGHT - inset * 2);
    ctx.fillRect(MAP_WIDTH - inset, inset, inset, MAP_HEIGHT - inset * 2);

    // Glowing Neon Warning Boundary
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 6;
    ctx.strokeRect(inset, inset, MAP_WIDTH - inset * 2, MAP_HEIGHT - inset * 2);
    ctx.restore();
  };

  // Authentic Brawl Stars Aiming Reticle (Shotgun cones, Laser lines, Rocket reticles)
  const drawAimReticle = (ctx: CanvasRenderingContext2D, b: BrawlerEntity) => {
    const cfg = BRAWLERS[b.brawlerId];
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.aimAngle);

    const isSuperReady = b.superCharge >= 100;
    const reticleColor = isSuperReady ? 'rgba(250, 204, 21, 0.7)' : 'rgba(56, 189, 248, 0.55)';
    ctx.strokeStyle = reticleColor;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);

    if (b.brawlerId === 'shelly') {
      // Shotgun Spread Cone
      const halfAngle = cfg.spreadAngle || 0.28;
      ctx.beginPath();
      ctx.moveTo(25, 0);
      ctx.lineTo(cfg.range, -cfg.range * Math.sin(halfAngle));
      ctx.moveTo(25, 0);
      ctx.lineTo(cfg.range, cfg.range * Math.sin(halfAngle));
      ctx.stroke();

      // Center aim beam
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(25, 0);
      ctx.lineTo(cfg.range, 0);
      ctx.stroke();
    } else if (b.brawlerId === 'colt') {
      // Dual Laser Straight Beam
      ctx.beginPath();
      ctx.moveTo(25, -4);
      ctx.lineTo(cfg.range, -4);
      ctx.moveTo(25, 4);
      ctx.lineTo(cfg.range, 4);
      ctx.stroke();
    } else if (b.brawlerId === 'brock') {
      // Long-Range Rocket Trajectory with Target Ring
      ctx.beginPath();
      ctx.moveTo(25, 0);
      ctx.lineTo(cfg.range, 0);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(cfg.range, 0, 16, 0, Math.PI * 2);
      ctx.stroke();
    } else if (b.brawlerId === 'spike') {
      // Cactus Bomb Trajectory with 6-Way Spike Tip
      ctx.beginPath();
      ctx.moveTo(25, 0);
      ctx.lineTo(cfg.range, 0);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(cfg.range, 0, 12, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Default trajectory
      ctx.beginPath();
      ctx.moveTo(25, 0);
      ctx.lineTo(cfg.range, 0);
      ctx.stroke();
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
    ctx.font = 'bold 22px sans-serif';
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="w-full h-full object-cover block cursor-crosshair"
      />
    </div>
  );
};
