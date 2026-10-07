/**
 * The effect primitives.
 *
 * This list is the simulation's whole vocabulary of consequences. Every
 * ability in the game — every attack, Super, gadget, star power and passive,
 * across the entire roster — is some arrangement of these and nothing else.
 * Adding a character never adds to this file; adding a genuinely new kind of
 * mechanic adds exactly one entry, and `AbilityAction` grows by one case.
 */

export { applyDamage, type DamageParams } from './damage';
export { applyAreaDamage } from './areaDamage';
export { applyHeal, healOne, type HealParams } from './heal';
export { applyKnockback, applyImpulse } from './knockback';
export { applyPull, placeAt } from './pull';
export { applyStatus, applyStatuses, tickStatuses } from './applyStatus';
export { spawnProjectile, type SpawnProjectileParams } from './spawnProjectile';
export { spawnHazard } from './spawnHazard';
export { spawnDecoy, type SpawnDecoyParams } from './spawnEntity';
export { spawnDeployable, type SpawnDeployableParams } from './spawnDeployable';
export { teleport } from './teleport';
export { applyDash } from './dash';
export { applyShield, absorbWithShield } from './shield';
export { chargeSuperFlat, chargeSuperForDamage } from './chargeSuper';
export { restoreAmmo } from './restoreAmmo';
