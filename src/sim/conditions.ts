/**
 * Changes that hold while something is true of a brawler.
 *
 * A kit lists them as data (`traits.conditional`); this is the one place that
 * knows how to read the list, so the engine, which applies them, and the client
 * prediction, which has to move at the same speed, cannot disagree.
 */

import type { BrawlerEntity } from '../types/brawl';
import type { Kit } from './kits/schema';

export interface Mods {
  /** Multiplies top speed. */
  speed: number;
  /** Multiplies how fast ammo comes back. */
  reload: number;
  /** Multiplies damage taken. */
  taken: number;
  /** Health recovered per second, as a fraction of maximum. */
  healPerSec: number;
}

const NEUTRAL: Mods = { speed: 1, reload: 1, taken: 1, healPerSec: 0 };

type State = Pick<BrawlerEntity, 'hp' | 'maxHp' | 'invisibilityTimer' | 'isInBush' | 'superActiveTimer'>;

export function conditionalMods(b: State, kit: Kit): Mods {
  const list = kit.traits?.conditional;
  if (!list || list.length === 0) return NEUTRAL;

  const out: Mods = { speed: 1, reload: 1, taken: 1, healPerSec: 0 };
  for (const c of list) {
    let holds = false;
    switch (c.when) {
      case 'invisible':
        holds = b.invisibilityTimer > 0;
        break;
      case 'healthBelow':
        holds = b.hp < b.maxHp * (c.below ?? 0.4);
        break;
      case 'inBush':
        holds = b.isInBush;
        break;
      case 'superActive':
        holds = b.superActiveTimer > 0;
        break;
    }
    if (!holds) continue;
    if (c.speed !== undefined) out.speed *= c.speed;
    if (c.reload !== undefined) out.reload *= c.reload;
    if (c.taken !== undefined) out.taken *= c.taken;
    if (c.healPerSec !== undefined) out.healPerSec += c.healPerSec;
  }
  return out;
}
