/**
 * Summoned bodies — currently a decoy, later turrets, minions and mines.
 *
 * A summon is a real brawler entity, not a special case: it collides, takes
 * damage, blocks line of sight and draws fire, because that is the only way a
 * decoy actually works as a decoy. What it cannot do is act, which is decided
 * by `isClone` in the brawler update rather than by a different entity type.
 */

import type { BrawlerEntity } from '../../types/brawl';
import type { SimWorld } from '../world';
import { createBrawlerEntity } from '../entity';

export interface SpawnDecoyParams {
  owner: BrawlerEntity;
  lifetime: number;
  offset?: number;
}

export function spawnDecoy(world: SimWorld, p: SpawnDecoyParams): BrawlerEntity {
  const { owner } = p;
  const offset = p.offset ?? 24;
  const decoy = createBrawlerEntity({
    id: world.nextId('decoy'),
    name: owner.name + ' (KOPYA)',
    brawlerId: owner.brawlerId,
    team: owner.team,
    x: owner.x + offset,
    y: owner.y + offset,
    isBot: true,
    isClone: true,
    decoyLifetime: p.lifetime,
    hp: owner.hp,
    maxHp: owner.maxHp,
    powerCubes: owner.powerCubes,
  });

  decoy.angle = owner.angle;
  decoy.aimAngle = owner.aimAngle;
  // It can never shoot, so it should never look like it is about to.
  decoy.ammo = 0;
  decoy.gadgetCharges = 0;

  world.brawlers.push(decoy);
  return decoy;
}
