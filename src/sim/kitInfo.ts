/**
 * What the UI is allowed to know about a kit.
 *
 * The HUD used to hard-code one badge per character — a block for the medic
 * star power, another for the speed trait — which meant every new brawler was
 * also a UI change. These helpers let the HUD ask "what should I show for this
 * brawler" and get an answer derived from the kit data.
 */

import type { BrawlerEntity } from '../types/brawl';
import { getKit } from './kits';

export interface PassiveStatus {
  name: string;
  /** Seconds left before it can fire again. Zero when ready. */
  remaining: number;
  ready: boolean;
}

/**
 * The passives worth showing: the ones on a cooldown, because those are the
 * only ones whose state the player can act on. A continuous passive is either
 * always on or irrelevant to the decision being made.
 */
export function listCooldownPassives(b: BrawlerEntity): PassiveStatus[] {
  const passives = getKit(b.brawlerId).passives;
  if (!passives) return [];

  const out: PassiveStatus[] = [];
  for (const passive of passives) {
    if (!passive.cooldown) continue;
    const remaining = Math.max(0, b.passiveCooldowns[passive.name] ?? 0);
    out.push({ name: passive.name, remaining, ready: remaining <= 0 });
  }
  return out;
}

/** True when some cooldown-gated passive is armed, for the name-plate badge. */
export function hasArmedPassive(b: BrawlerEntity): boolean {
  return listCooldownPassives(b).some(p => p.ready);
}

/** Always-on modifiers worth a line in the HUD. */
export function kitTraitLabels(b: BrawlerEntity): string[] {
  const traits = getKit(b.brawlerId).traits;
  if (!traits) return [];

  const labels: string[] = [];
  if (traits.speedMultiplier && traits.speedMultiplier !== 1) {
    labels.push('HIZ +' + Math.round((traits.speedMultiplier - 1) * 100) + '%');
  }
  if (traits.superChargeFromDamageTaken) {
    labels.push('HASAR ALDIKÇA ŞARJ');
  }
  return labels;
}
