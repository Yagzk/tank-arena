/**
 * The roster's movesets, compiled and checked.
 *
 * Adding a character is adding a file here and a line to `KITS`. There is no
 * engine branch to write, no switch to extend: the interpreter in
 * `src/sim/abilities.ts` already knows how to run anything expressible in the
 * kit language, and `validateKit` already knows how to reject anything that is
 * not.
 */

import type { BrawlerId } from '../../types/brawl';
import type { AbilityAction, Kit } from './schema';
import { assignKey, registerActions, registerHooks } from './registry';
import { validateKit } from './validate';

import { miraKit } from './mira';
import { rivetKit } from './rivet';
import { boulderKit } from './boulder';
import { fuseKit } from './fuse';
import { thornKit } from './thorn';
import { wispKit } from './wisp';

export const KITS: Record<BrawlerId, Kit> = {
  mira: miraKit,
  rivet: rivetKit,
  boulder: boulderKit,
  fuse: fuseKit,
  thorn: thornKit,
  wisp: wispKit,
};

/**
 * Walks a kit and gives a stable key to everything that is referenced later —
 * a burst's action list, a projectile's hooks, a jump's landing payload.
 *
 * The key is the path through the kit, so it is identical on every machine
 * running the same build. That is what lets a projectile carry one short
 * string across the network instead of its whole behaviour.
 */
function compileActions(prefix: string, actions: AbilityAction[]): void {
  actions.forEach((action, i) => {
    const path = prefix + '.' + i;

    switch (action.type) {
      case 'burst':
        assignKey(action, path);
        registerActions(path, action.actions);
        compileActions(path + '.b', action.actions);
        break;

      case 'projectiles': {
        const spec = action.projectile;
        if (spec.applyStatus || spec.onHit || spec.onEnd) {
          const key = path + '.p';
          assignKey(spec, key);
          registerHooks(key, {
            applyStatus: spec.applyStatus,
            onHit: spec.onHit,
            onEnd: spec.onEnd,
          });
          if (spec.onHit) compileActions(key + '.h', spec.onHit);
          if (spec.onEnd) compileActions(key + '.e', spec.onEnd);
        }
        break;
      }

      case 'jump':
        if (action.onLand) {
          const key = path + '.land';
          assignKey(action, key);
          registerActions(key, action.onLand);
          compileActions(key + '.l', action.onLand);
        }
        break;

      default:
        break;
    }
  });
}

function compileKit(kit: Kit): void {
  compileActions(kit.id + '.attack', kit.attack.actions);
  compileActions(kit.id + '.super', kit.super.actions);
  compileActions(kit.id + '.gadget', kit.gadget.actions);
  kit.passives?.forEach((passive, i) => {
    compileActions(kit.id + '.passive' + i, passive.actions);
  });
}

// Compiled and checked once, at module load. A kit that does not hold up
// stops the app from starting rather than failing in the middle of a match.
const problems: string[] = [];
for (const id of Object.keys(KITS) as BrawlerId[]) {
  const kit = KITS[id];
  if (kit.id !== id) problems.push(id + ': kit id "' + kit.id + '" does not match its key');
  problems.push(...validateKit(kit));
  compileKit(kit);
}

if (problems.length > 0) {
  throw new Error('Bozuk kit tanımı:\n  ' + problems.join('\n  '));
}

export function getKit(id: BrawlerId): Kit {
  return KITS[id];
}

export { validateKit };
export type { Kit };
