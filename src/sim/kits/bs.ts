/**
 * Units for writing kits from the original game's numbers.
 *
 * The reference game measures range in tiles, speed in points per second, and
 * a tile is 300 points. Here a tile is 60 pixels, so a point is a fifth of a
 * pixel. Keeping the conversion in one place means a kit can be written with the
 * number it was copied from, and read back the same way.
 */

/** Range, or any distance, given in tiles. */
export const tiles = (n: number): number => Math.round(n * 60);

/** Movement or projectile speed given in points per second. */
export const speed = (points: number): number => Math.round(points / 5);

/** Degrees to radians, for spreads. */
export const deg = (d: number): number => (d * Math.PI) / 180;

/** The seven wiki "reload speeds" are just seconds; this is here to make that obvious in a kit. */
export const seconds = (s: number): number => s;
