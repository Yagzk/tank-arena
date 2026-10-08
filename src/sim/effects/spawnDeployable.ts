/**
 * Placing something on the battlefield that acts without you.
 *
 * A turret, a minion, a mine, a healing station and a barrier are one entity
 * with five decision rules. Writing them as five entity types would recreate
 * exactly the problem the ability switches had: the sixth one would be a sixth
 * place to edit.
 */

import type { BrawlerEntity, DeployedEntity, DeployedKind } from '../../types/brawl';
import type { SimWorld } from '../world';

/** Which decision rule each kind runs on. */
const BEHAVIOUR: Record<DeployedKind, DeployedEntity['behaviour']> = {
  turret: 'turret',
  minion: 'chase',
  mine: 'proximity',
  healStation: 'aura',
  barrier: 'blocker',
  wall: 'solid',
  cactus: 'cover',
  vending: 'cover',
  lollipop: 'aura',
  pad: 'proximity',
  tornado: 'aura',
  head: 'chase',
};

/** Sensible bodies, so a kit only states what is distinctive about its own. */
const DEFAULT_RADIUS: Record<DeployedKind, number> = {
  turret: 20,
  minion: 16,
  mine: 13,
  healStation: 22,
  barrier: 30,
  wall: 30,
  cactus: 34,
  vending: 32,
  lollipop: 22,
  pad: 28,
  tornado: 60,
  head: 22,
};

export interface SpawnDeployableParams {
  owner: BrawlerEntity;
  kind: DeployedKind;
  x: number;
  y: number;
  angle: number;
  lifetime: number;
  hp: number;
  radius?: number;
  interval?: number;
  range?: number;
  speed?: number;
  actionKey?: string;
  decay?: number;
  onDestroyKey?: string;
}

export function spawnDeployable(world: SimWorld, p: SpawnDeployableParams): DeployedEntity {
  const entity: DeployedEntity = {
    id: world.nextId(p.kind),
    ownerId: p.owner.id,
    team: p.owner.team,
    brawlerId: p.owner.brawlerId,
    kind: p.kind,
    behaviour: BEHAVIOUR[p.kind],
    x: p.x,
    y: p.y,
    angle: p.angle,
    radius: p.radius ?? DEFAULT_RADIUS[p.kind],
    hp: p.hp,
    maxHp: p.hp,
    lifetime: p.lifetime,
    // A deployable does not act on the tick it lands. A mine that went off
    // instantly would be a melee attack, and a turret that fired on arrival
    // would make placing it a burst of free damage.
    actTimer: p.interval ?? 1,
    interval: p.interval ?? 1,
    range: p.range ?? 0,
    speed: p.speed,
    actionKey: p.actionKey,
    decay: p.decay,
    onDestroyKey: p.onDestroyKey,
  };

  world.deployables.push(entity);
  return entity;
}
