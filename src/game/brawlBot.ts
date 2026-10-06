import { BrawlerEntity, BrawlPlayerInput, BrawlWall, Bush, GemDrop, PowerCubeDrop, PowerCubeBox } from '../types/brawl';
import { dist } from './physics';

export class BrawlBot {
  private changeMoveTimer: number = 0;
  private currentMoveX: number = 0;
  private currentMoveY: number = 0;
  private attackCooldown: number = 0;

  public update(
    bot: BrawlerEntity,
    allBrawlers: BrawlerEntity[],
    walls: BrawlWall[],
    bushes: Bush[],
    boxes: PowerCubeBox[],
    powerCubes: PowerCubeDrop[],
    gems: GemDrop[],
    dt: number
  ): BrawlPlayerInput {
    this.changeMoveTimer -= dt;
    this.attackCooldown -= dt;

    // Find nearest living enemy
    const enemies = allBrawlers.filter(b => b.id !== bot.id && b.isAlive && (b.team !== bot.team || bot.team === -1));
    let nearestEnemy: BrawlerEntity | null = null;
    let minEnemyDist = Infinity;

    for (const enemy of enemies) {
      // If enemy is in bush and invisible to us, skip targeting unless very close
      if (enemy.isInBush && !enemy.isVisibleToEnemies && dist(bot.x, bot.y, enemy.x, enemy.y) > 70) {
        continue;
      }
      if (enemy.invisibilityTimer > 0) continue; // Leon invisible

      const d = dist(bot.x, bot.y, enemy.x, enemy.y);
      if (d < minEnemyDist) {
        minEnemyDist = d;
        nearestEnemy = enemy;
      }
    }

    // Aim calculation
    let aimAngle = bot.angle;
    let shouldAttack = false;
    let shouldSuper = false;

    // Target either enemy or nearby power cube box
    let targetX = 0;
    let targetY = 0;
    let hasTarget = false;

    if (nearestEnemy) {
      targetX = nearestEnemy.x;
      targetY = nearestEnemy.y;
      hasTarget = true;
    } else {
      // Find nearest box
      let nearestBox: PowerCubeBox | null = null;
      let minBoxDist = Infinity;
      for (const box of boxes) {
        const d = dist(bot.x, bot.y, box.x + box.w / 2, box.y + box.h / 2);
        if (d < minBoxDist) {
          minBoxDist = d;
          nearestBox = box;
        }
      }
      if (nearestBox) {
        targetX = nearestBox.x + nearestBox.w / 2;
        targetY = nearestBox.y + nearestBox.h / 2;
        hasTarget = true;
      }
    }

    if (hasTarget) {
      aimAngle = Math.atan2(targetY - bot.y, targetX - bot.x);

      // Check attack range based on brawler
      const maxRange = bot.brawlerId === 'el_primo' ? 160 : bot.brawlerId === 'shelly' ? 300 : 420;
      const targetDist = dist(bot.x, bot.y, targetX, targetY);

      if (targetDist <= maxRange && bot.ammo >= 1 && this.attackCooldown <= 0) {
        shouldAttack = true;
        this.attackCooldown = 0.45 + Math.random() * 0.35;
      }

      // Super activation logic
      if (bot.superCharge >= 100) {
        if (bot.brawlerId === 'el_primo' && targetDist < 400 && targetDist > 100) {
          shouldSuper = true;
        } else if (bot.brawlerId === 'shelly' && targetDist < 260) {
          shouldSuper = true;
        } else if (bot.brawlerId === 'colt' && targetDist < 500) {
          shouldSuper = true;
        } else if (bot.brawlerId === 'brock' && targetDist < 520) {
          shouldSuper = true;
        } else if (bot.brawlerId === 'spike' && targetDist < 380) {
          shouldSuper = true;
        } else if (bot.brawlerId === 'leon') {
          shouldSuper = true;
        }
      }
    }

    // Movement: Retreat if low HP (< 35%), otherwise chase target or grab gems/cubes
    if (this.changeMoveTimer <= 0) {
      this.changeMoveTimer = 0.4 + Math.random() * 0.5;

      const isLowHp = bot.hp < bot.maxHp * 0.35;

      if (isLowHp && nearestEnemy) {
        // Run away from enemy into safety
        const awayAngle = Math.atan2(bot.y - nearestEnemy.y, bot.x - nearestEnemy.x);
        this.currentMoveX = Math.cos(awayAngle);
        this.currentMoveY = Math.sin(awayAngle);
      } else {
        // Collect nearby items
        let closestItem: { x: number; y: number } | null = null;
        let minItemDist = 320;

        for (const gem of gems) {
          const d = dist(bot.x, bot.y, gem.x, gem.y);
          if (d < minItemDist) { minItemDist = d; closestItem = gem; }
        }
        for (const cube of powerCubes) {
          const d = dist(bot.x, bot.y, cube.x, cube.y);
          if (d < minItemDist) { minItemDist = d; closestItem = cube; }
        }

        if (closestItem) {
          const ang = Math.atan2(closestItem.y - bot.y, closestItem.x - bot.x);
          this.currentMoveX = Math.cos(ang);
          this.currentMoveY = Math.sin(ang);
        } else if (hasTarget) {
          const ang = Math.atan2(targetY - bot.y, targetX - bot.x);
          const d = dist(bot.x, bot.y, targetX, targetY);

          // Ranged brawlers kite (keep optimal distance)
          if (bot.brawlerId !== 'el_primo' && d < 180) {
            this.currentMoveX = -Math.cos(ang) * 0.8;
            this.currentMoveY = -Math.sin(ang) * 0.8;
          } else {
            this.currentMoveX = Math.cos(ang);
            this.currentMoveY = Math.sin(ang);
          }
        } else {
          // Wander
          const randAngle = Math.random() * Math.PI * 2;
          this.currentMoveX = Math.cos(randAngle);
          this.currentMoveY = Math.sin(randAngle);
        }
      }
    }

    return {
      moveX: this.currentMoveX,
      moveY: this.currentMoveY,
      aimAngle,
      attack: shouldAttack,
      superAttack: shouldSuper,
      superTargetX: targetX,
      superTargetY: targetY,
    };
  }
}
