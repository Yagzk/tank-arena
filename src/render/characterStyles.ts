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
  molotof: {
    primary: '#c2410c',
    secondary: '#5a2208',
    accent: '#fb923c',
    skin: '#c98b5a',
    hair: '#431407',
    build: 'medium',
    weapon: 'flask',
    headgear: 'mask',
  },
  ustabasi: {
    // Grey on grey, with the accent doing all the identifying work: the
    // silhouette has to read as the one carrying equipment, not a colour.
    primary: '#475569',
    secondary: '#1e293b',
    accent: '#facc15',
    skin: '#b47b50',
    hair: '#0f172a',
    build: 'heavy',
    weapon: 'toolgun',
    headgear: 'visor',
  },
  nagme: {
    primary: '#be185d',
    secondary: '#500724',
    accent: '#fbcfe8',
    skin: '#e8b48c',
    hair: '#831843',
    build: 'light',
    weapon: 'horn',
    headgear: 'crest',
  },
  zirh: {
    primary: '#0f766e',
    secondary: '#042f2e',
    accent: '#5eead4',
    skin: '#a9693c',
    hair: '#134e4a',
    build: 'heavy',
    weapon: 'hammer',
    headgear: 'helm',
  },
};
