import { Tank, PlayerInput, Wall, PowerUp } from '../types/game';
import { dist, hasLineOfSight } from './physics';

export class BotController {
  private changeDirTimer: number = 0;
  private currentMove: { forward: boolean; backward: boolean; left: boolean; right: boolean } = {
    forward: true,
    backward: false,
    left: false,
    right: false,
  };
  private shootCooldown: number = 0;

  public update(bot: Tank, allTanks: Tank[], walls: Wall[], powerups: PowerUp[], dt: number): PlayerInput {
    this.changeDirTimer -= dt;
    this.shootCooldown -= dt;

    // Find nearest living enemy tank
    const enemies = allTanks.filter(t => t.id !== bot.id && t.isAlive);
    let targetEnemy: Tank | null = null;
    let minEnemyDist = Infinity;

    for (const enemy of enemies) {
      const d = dist(bot.x, bot.y, enemy.x, enemy.y);
      if (d < minEnemyDist) {
        minEnemyDist = d;
        targetEnemy = enemy;
      }
    }

    // Aim turret at target enemy or nearby powerup
    let targetAimAngle = bot.angle;
    let shouldShoot = false;

    if (targetEnemy) {
      const dx = targetEnemy.x - bot.x;
      const dy = targetEnemy.y - bot.y;
      targetAimAngle = Math.atan2(dy, dx);

      // Check if line of sight is clear
      const los = hasLineOfSight(bot.x, bot.y, targetEnemy.x, targetEnemy.y, walls);
      if (los && this.shootCooldown <= 0 && minEnemyDist < 600) {
        shouldShoot = true;
        this.shootCooldown = 0.5 + Math.random() * 0.4;
      }
    }

    // Steering & Navigation
    if (this.changeDirTimer <= 0) {
      this.changeDirTimer = 0.6 + Math.random() * 0.8;

      if (targetEnemy) {
        const angleToTarget = Math.atan2(targetEnemy.y - bot.y, targetEnemy.x - bot.x);
        let diff = angleToTarget - bot.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        if (diff > 0.2) {
          this.currentMove = { forward: true, backward: false, left: false, right: true };
        } else if (diff < -0.2) {
          this.currentMove = { forward: true, backward: false, left: true, right: false };
        } else {
          this.currentMove = { forward: true, backward: false, left: false, right: false };
        }
      } else {
        // Random patrol
        const rand = Math.random();
        this.currentMove = {
          forward: rand > 0.2,
          backward: rand < 0.1,
          left: rand > 0.4 && rand < 0.7,
          right: rand >= 0.7,
        };
      }
    }

    // Occasionally drop a mine if enemy is close behind
    const shouldMine = targetEnemy && minEnemyDist < 120 && Math.random() < 0.05;

    return {
      moveForward: this.currentMove.forward,
      moveBackward: this.currentMove.backward,
      turnLeft: this.currentMove.left,
      turnRight: this.currentMove.right,
      aimAngle: targetAimAngle,
      shoot: shouldShoot,
      placeMine: !!shouldMine,
    };
  }
}
