/**
 * Ammo, in whole slots.
 *
 * Whole slots rather than a fraction because the pips under the brawler are
 * what the player reads: a fractional counter let you fire the instant the bar
 * ticked over, so the display never matched what you could actually do.
 */

import type { BrawlerEntity } from '../../types/brawl';

export function restoreAmmo(b: BrawlerEntity, slots: number): number {
  const before = b.ammo;
  b.ammo = Math.max(0, Math.min(b.maxAmmo, b.ammo + slots));
  if (b.ammo >= b.maxAmmo) b.reloadTimer = 0;
  return b.ammo - before;
}
