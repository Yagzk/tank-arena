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
import type { AbilityAction, GadgetSpec, Kit } from './schema';
import { assignKey, registerActions, registerHooks } from './registry';
import { validateKit } from './validate';

import { miraKit } from './mira';
import { rivetKit } from './rivet';
import { boulderKit } from './boulder';
import { fuseKit } from './fuse';
import { thornKit } from './thorn';
import { wispKit } from './wisp';
import { molotofKit } from './molotof';
import { ustabasiKit } from './ustabasi';
import { nagmeKit } from './nagme';
import { zirhKit } from './zirh';
import { karambolKit } from './karambol';
import { fisiltiKit } from './fisilti';
import { cengelKit } from './cengel';
import { buzKit } from './buz';
import { bekciKit } from './bekci';
import { kalkanKit } from './kalkan';
import { filizKit } from './filiz';
import { sisKit } from './sis';
import { lumenKit } from './lumen';
import { orsKit } from './ors';
import { devirKit } from './devir';
import { golgeKit } from './golge';
import { tiktakKit } from './tiktak';
import { pansumanKit } from './pansuman';
import { dinamitKit } from './dinamit';
import { miknatisKit } from './miknatis';

export const KITS: Record<BrawlerId, Kit> = {
  mira: miraKit,
  rivet: rivetKit,
  boulder: boulderKit,
  fuse: fuseKit,
  thorn: thornKit,
  wisp: wispKit,
  molotof: molotofKit,
  ustabasi: ustabasiKit,
  nagme: nagmeKit,
  zirh: zirhKit,
  karambol: karambolKit,
  fisilti: fisiltiKit,
  cengel: cengelKit,
  buz: buzKit,
  bekci: bekciKit,
  kalkan: kalkanKit,
  filiz: filizKit,
  sis: sisKit,
  lumen: lumenKit,
  ors: orsKit,
  devir: devirKit,
  golge: golgeKit,
  tiktak: tiktakKit,
  pansuman: pansumanKit,
  dinamit: dinamitKit,
  miknatis: miknatisKit,
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

      case 'summon':
        if (action.onAct) {
          const key = path + '.act';
          assignKey(action, key);
          registerActions(key, action.onAct);
          compileActions(key + '.a', action.onAct);
        }
        if (action.onDestroy) {
          const key = path + '.dst';
          assignKey(action.onDestroy, key);
          registerActions(key, action.onDestroy);
          compileActions(key + '.d', action.onDestroy);
        }
        break;

      case 'empower': {
        const key = path + '.emp';
        assignKey(action, key);
        registerActions(key, action.attack);
        compileActions(key + '.e', action.attack);
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

function compileKit(kit: Kit, prefix: string = kit.id): void {
  compileActions(prefix + '.attack', kit.attack.actions);
  kit.combo?.forEach((spec, i) => compileActions(prefix + '.combo' + i, spec.actions));
  compileActions(prefix + '.super', kit.super.actions);
  kit.gadgets?.forEach((g, i) => compileActions(prefix + '.gadget' + i, g.actions));
  if (kit.gadget) compileActions(prefix + '.gadget', kit.gadget.actions);
  kit.passives?.forEach((passive, i) => {
    compileActions(prefix + '.passive' + i, passive.actions);
  });
}

// Compiled and checked once, at module load. A kit that does not hold up
// stops the app from starting rather than failing in the middle of a match.
const problems: string[] = [];
const VARIANTS = {} as Record<BrawlerId, Kit[]>;

/**
 * A star power is an edit to the kit, so each one gets a kit of its own: a deep
 * copy with the edit applied, validated and compiled like the original. A
 * match then just asks for the kit that goes with what was chosen, and nothing
 * in the engine has to know what any star power does.
 */
function variantOf(base: Kit, index: number): Kit {
  const sp = base.starPowers![index];
  const { starPowers: _dropped, ...plain } = base;
  const copy = structuredClone(plain) as Kit;
  sp.apply(copy);
  return copy;
}

for (const id of Object.keys(KITS) as BrawlerId[]) {
  const kit = KITS[id];
  if (kit.id !== id) problems.push(id + ': kit id "' + kit.id + '" does not match its key');
  problems.push(...validateKit(kit));
  compileKit(kit);

  VARIANTS[id] = [kit];
  if (kit.starPowers) {
    for (let i = 0; i < kit.starPowers.length; i++) {
      const variant = variantOf(kit, i);
      problems.push(...validateKit(variant).map(m => '[' + kit.starPowers![i].name + '] ' + m));
      compileKit(variant, id + '.sp' + i);
      VARIANTS[id][i] = variant;
    }
  }
}

if (problems.length > 0) {
  throw new Error('Bozuk kit tanımı:\n  ' + problems.join('\n  '));
}

let testKitCounter = 0;

/**
 * Test seam: makes a character play with a kit written for the test, so a test
 * of a mechanic does not depend on how any real character is tuned this week.
 * Returns a function that puts the real kit back.
 */
export function withKit(id: BrawlerId, kit: Omit<Kit, 'id'>): () => void {
  const full = { ...kit, id } as Kit;
  const found = validateKit(full);
  if (found.length > 0) throw new Error('Bozuk test kiti: ' + found.join(' | '));
  compileKit(full, 'test' + testKitCounter++ + '.' + id);
  const savedVariants = VARIANTS[id];
  const savedKit = KITS[id];
  VARIANTS[id] = [full];
  KITS[id] = full;
  return () => {
    VARIANTS[id] = savedVariants;
    KITS[id] = savedKit;
  };
}

/** The kit a character plays with, given the star power it took (0 or 1). */
export function getKit(id: BrawlerId, starPower = 0): Kit {
  const variants = VARIANTS[id];
  return variants[starPower] ?? variants[0];
}

/** The gadget a character took in, normalised so a kit not yet moved to the two-gadget form still has one. */
export function gadgetOf(kit: Kit, index: number): GadgetSpec | null {
  if (kit.gadgets) return kit.gadgets[index] ?? kit.gadgets[0];
  if (kit.gadget) {
    return { name: kit.gadget.name, description: '', cooldown: LEGACY_GADGET_COOLDOWN, actions: kit.gadget.actions };
  }
  return null;
}

/** What gadgets cost before every character had real ones. */
const LEGACY_GADGET_COOLDOWN = 4.5;

export { validateKit };
export type { Kit, GadgetSpec };
