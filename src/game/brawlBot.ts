import {
  BrawlerEntity,
  BrawlPlayerInput,
  BrawlWall,
  Bush,
  GemDrop,
  PowerCubeDrop,
  PowerCubeBox,
  BRAWLERS,
} from '../types/brawl';
import { dist } from '../core/math';
import { hasLineOfSight } from '../core/collision';
import { getKit } from '../sim/kits';
import { NavGrid } from '../core/navGrid';

/** Cubes a bot wants banked before it goes looking for a fight. */
const LOOT_TARGET_CUBES = 3;

/** Inside this range a bot defends itself regardless of what it was doing. */
const ENGAGE_DISTANCE = 260;

/** Health fraction below which a bot disengages. */
const RETREAT_HEALTH = 0.42;

export class BrawlBot {
  private changeMoveTimer: number = 0;
  private currentMoveX: number = 0;
  private currentMoveY: number = 0;
  private attackCooldown: number = 0;
  /**
   * Whether the gadget is worth spending right now, decided alongside the
   * attack where the target distance is known and read further down, where
   * the input is assembled.
   */
  private wantsGadget: boolean = false;

  /** Distance field toward this bot's current objective. */
  private field: Int32Array | null = null;
  private repathTimer: number = 0;
  private fieldTargetX: number = 0;
  private fieldTargetY: number = 0;
  private readonly steer = { x: 0, y: 0 };

  public update(
    bot: BrawlerEntity,
    allBrawlers: BrawlerEntity[],
    walls: BrawlWall[],
    bushes: Bush[],
    boxes: PowerCubeBox[],
    powerCubes: PowerCubeDrop[],
    gems: GemDrop[],
    dt: number,
    nav: NavGrid
  ): BrawlPlayerInput {
    this.changeMoveTimer -= dt;
    this.attackCooldown -= dt;
    this.repathTimer -= dt;

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
    let canSeeTarget = false;
    let aimAngle = bot.angle;
    let shouldAttack = false;
    let shouldSuper = false;

    // Target either enemy or nearby power cube box
    let targetX = 0;
    let targetY = 0;
    let hasTarget = false;
    let targetDist = Infinity;

    let nearestBox: PowerCubeBox | null = null;
    let minBoxDist = Infinity;
    for (const box of boxes) {
      const d = dist(bot.x, bot.y, box.x + box.w / 2, box.y + box.h / 2);
      if (d < minBoxDist) {
        minBoxDist = d;
        nearestBox = box;
      }
    }

    /*
     * Objective choice.
     *
     * Bots used to charge the nearest enemy the instant they could see one,
     * which is why every match collapsed into a brawl in the first few seconds
     * and was over inside half a minute. A bot that is still weak now prefers
     * loot it can reach sooner than the fight, which gives a round the opening
     * phase it was missing — and makes power cubes worth contesting, because
     * the bots are contesting them.
     */
    const isWeak = bot.powerCubes < LOOT_TARGET_CUBES;
    const lootIsCloser = nearestBox !== null && minBoxDist < minEnemyDist * 0.85;
    const enemyIsOnTopOfUs = minEnemyDist < ENGAGE_DISTANCE;

    if (nearestEnemy && (!isWeak || enemyIsOnTopOfUs || !lootIsCloser)) {
      targetX = nearestEnemy.x;
      targetY = nearestEnemy.y;
      hasTarget = true;
    } else if (nearestBox) {
      targetX = nearestBox.x + nearestBox.w / 2;
      targetY = nearestBox.y + nearestBox.h / 2;
      hasTarget = true;
    } else if (nearestEnemy) {
      targetX = nearestEnemy.x;
      targetY = nearestEnemy.y;
      hasTarget = true;
    }

    if (hasTarget) {
      targetDist = dist(bot.x, bot.y, targetX, targetY);

      // Lead a moving target by the projectile's flight time. Aiming at where
      // an enemy currently stands means every shot lands behind them the moment
      // they move, which is why bots never hit anything that was not walking
      // straight at them.
      //
      // The lead is deliberately short of perfect: a bot that solves the
      // intercept exactly is unpleasant to play against.
      let leadX = targetX;
      let leadY = targetY;
      if (nearestEnemy) {
        const speed = BRAWLERS[bot.brawlerId].projectileSpeed || 500;
        const flightTime = Math.min(targetDist / speed, 0.6);
        leadX += nearestEnemy.vx * flightTime * 0.82;
        leadY += nearestEnemy.vy * flightTime * 0.82;
      }
      aimAngle = Math.atan2(leadY - bot.y, leadX - bot.x);

      // How this character wants to fight, read off its kit. Ranges are
      // fractions of its own reach, so a balance pass on the weapon moves the
      // bot with it.
      const profile = getKit(bot.brawlerId).bot;
      const reach = BRAWLERS[bot.brawlerId].range;
      const maxRange = reach * (profile?.engageRange ?? 0.85);

      // Bots used to fire whenever a target was in range, including straight
      // into the wall they were standing behind. Gate the trigger on actually
      // being able to see what they are shooting at — unless the attack arcs
      // over walls, in which case cover is where it wants to be.
      const lineOfSight = hasLineOfSight(bot.x, bot.y, targetX, targetY, walls);
      canSeeTarget = lineOfSight || profile?.ignoresCover === true;

      if (targetDist <= maxRange && canSeeTarget && bot.ammo >= 1 && this.attackCooldown <= 0) {
        shouldAttack = true;
        this.attackCooldown = 0.45 + Math.random() * 0.35;
      }

      if (bot.superCharge >= 100 && canSeeTarget) {
        const min = (profile?.superRange?.min ?? 0) * reach;
        const max = (profile?.superRange?.max ?? 1.1) * reach;
        shouldSuper = targetDist >= min && targetDist <= max;
      }

      const gadget = profile?.gadget;
      if (bot.gadgetCharges > 0 && bot.gadgetCooldown <= 0 && gadget) {
        switch (gadget.when) {
          case 'enemyWithin':
            this.wantsGadget = targetDist < gadget.range;
            break;
          case 'enemyBetween':
            this.wantsGadget = targetDist > gadget.min && targetDist < gadget.max;
            break;
          case 'outOfAmmo':
            this.wantsGadget = bot.ammo < 1 && targetDist < gadget.range;
            break;
          case 'chance':
            this.wantsGadget = targetDist < gadget.range && Math.random() < gadget.probability;
            break;
        }
      } else {
        this.wantsGadget = false;
      }
    }

    // Movement: Retreat if low HP (< 35%), otherwise chase target or grab gems/cubes
    if (this.changeMoveTimer <= 0) {
      this.changeMoveTimer = 0.4 + Math.random() * 0.5;

      const isLowHp = bot.hp < bot.maxHp * RETREAT_HEALTH;

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
          if (bot.brawlerId !== 'boulder' && d < 180) {
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

      const shouldGadget = this.wantsGadget;

    // Pathfinding runs every tick rather than on the decision timer: a route
    // is only useful if the body keeps following it between decisions. When the
    // objective is in plain sight the straight line is both shorter and
    // smoother, so the flow field is only consulted around obstacles.
    if (hasTarget && !canSeeTarget) {
      this.followRoute(bot, nav, targetX, targetY);
    }

    return {
      moveX: this.currentMoveX,
      moveY: this.currentMoveY,
      aimAngle,
      attack: shouldAttack,
      superAttack: shouldSuper,
      gadget: shouldGadget,
      superTargetX: targetX,
      superTargetY: targetY,
    };
  }

  /**
   * Steers along the flow field toward (tx, ty).
   *
   * The field is recomputed on a timer, and immediately whenever the objective
   * has moved far enough that the old route would send the bot to where the
   * target used to be. Flooding the whole grid is cheap — a few thousand cells —
   * so this stays well inside budget even with ten bots.
   */
  private followRoute(bot: BrawlerEntity, nav: NavGrid, tx: number, ty: number) {
    if (!this.field) this.field = nav.createField();

    const targetMoved = dist(tx, ty, this.fieldTargetX, this.fieldTargetY) > 110;
    if (this.repathTimer <= 0 || targetMoved) {
      this.repathTimer = 0.4;
      this.fieldTargetX = tx;
      this.fieldTargetY = ty;
      nav.computeDistanceField(tx, ty, this.field);
    }

    // When no neighbouring cell is closer the bot is either standing on the
    // goal or the objective is walled off entirely. Either way, leave the
    // decision layer's heading alone rather than freezing in place.
    if (nav.sampleDirection(bot.x, bot.y, this.field, this.steer)) {
      this.currentMoveX = this.steer.x;
      this.currentMoveY = this.steer.y;
    }
  }
}
