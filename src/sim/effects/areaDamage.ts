/**
 * A blast: damage and knockback to every hostile body in a radius, plus
 * terrain destruction.
 *
 * Explosions deliberately spare the caster. Before, the tank's landing took
 * 1300 off his own health bar and the artillery gadget blew its owner up on
 * the way out — the kind of bug that only shows up when you actually play.
 */

import type { SimWorld, ExplosionParams } from '../world';

export function applyAreaDamage(world: SimWorld, params: ExplosionParams): void {
  world.explode(params);
}
