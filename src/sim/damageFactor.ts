/**
 * How much a brawler's damage is multiplied by, apart from any one attack.
 *
 * Power cubes make everyone hit harder; a kit's `damageScale` is the balance
 * dial for the character as a whole. Keeping both in one place means every path
 * that deals damage on a brawler's behalf — a shot, a turret, a mine, a burst
 * still firing after they were stunned — uses the same number.
 */

import type { BrawlerEntity } from '../types/brawl';
import { getKit } from './kits';

export function damageFactor(b: BrawlerEntity): number {
  return (1 + b.powerCubes * 0.1) * (getKit(b.brawlerId).traits?.damageScale ?? 1);
}
