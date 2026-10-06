/**
 * Visual identity for each character: palette, silhouette, weapon and headgear.
 *
 * Kept out of `types/brawl` on purpose — the simulation has no business knowing
 * what anybody looks like, and the renderer is the only consumer.
 */

import type { BrawlerId } from '../types/brawl';
import type { CharacterStyle } from './characterArt';

export const CHARACTER_STYLES: Record<BrawlerId, CharacterStyle> = {
  mira: {
    primary: '#7c3aed',
    secondary: '#3b2a63',
    accent: '#f0abfc',
    skin: '#e4a67a',
    hair: '#c084fc',
    build: 'medium',
    weapon: 'scattergun',
    headgear: 'hood',
  },
  rivet: {
    primary: '#dc2626',
    secondary: '#4b1d1d',
    accent: '#fca5a5',
    skin: '#f0c08a',
    hair: '#1f2937',
    build: 'light',
    weapon: 'twin_blasters',
    headgear: 'cap',
  },
  boulder: {
    primary: '#0369a1',
    secondary: '#1e3a5f',
    accent: '#38bdf8',
    skin: '#d99a63',
    hair: '#0c4a6e',
    build: 'heavy',
    weapon: 'gauntlets',
    headgear: 'mask',
  },
  fuse: {
    primary: '#d97706',
    secondary: '#4a2c08',
    accent: '#fbbf24',
    skin: '#8d5524',
    hair: '#1c1917',
    build: 'medium',
    weapon: 'launcher',
    headgear: 'goggles',
  },
  thorn: {
    primary: '#15803d',
    secondary: '#14532d',
    accent: '#86efac',
    skin: '#4ade80',
    hair: '#166534',
    build: 'light',
    weapon: 'satchel',
    headgear: 'crest',
  },
  wisp: {
    primary: '#0891b2',
    secondary: '#134e4a',
    accent: '#67e8f9',
    skin: '#d9c7a7',
    hair: '#0e7490',
    build: 'light',
    weapon: 'blades',
    headgear: 'hood',
  },
};
