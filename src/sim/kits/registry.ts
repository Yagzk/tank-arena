/**
 * Compiled kit lookups.
 *
 * Two things in a kit are referenced *later*, after the ability that owns them
 * has finished running: the action list a burst repeats, and the hooks a
 * projectile carries. Those cannot be passed along as objects — a projectile
 * crosses the network, and a queued burst has to survive on an entity between
 * ticks.
 *
 * So at load time every such list is given a stable key derived from its
 * position in the kit, and only the key travels. Both peers run the same kit
 * data, so both resolve the same key to the same behaviour, and a packet
 * carries one short string instead of a nested object graph.
 */

import type { AbilityAction, StatusSpec } from './schema';

export interface ProjectileHooks {
  /** Statuses applied to a body the projectile connects with. */
  applyStatus?: StatusSpec[];
  /** Runs at the point of contact, only on a body hit. */
  onHit?: AbilityAction[];
  /** Runs wherever the projectile comes to rest. */
  onEnd?: AbilityAction[];
}

/**
 * Object identity to key. A `WeakMap` rather than a field on the data, so kit
 * files stay plain declarations with nothing generated written back into them.
 */
const keyOf = new WeakMap<object, string>();
const actionsByKey = new Map<string, AbilityAction[]>();
const hooksByKey = new Map<string, ProjectileHooks>();

export function assignKey(owner: object, key: string): void {
  keyOf.set(owner, key);
}

export function keyFor(owner: object): string | undefined {
  return keyOf.get(owner);
}

export function registerActions(key: string, actions: AbilityAction[]): void {
  actionsByKey.set(key, actions);
}

export function getActions(key: string): AbilityAction[] | undefined {
  return actionsByKey.get(key);
}

export function registerHooks(key: string, hooks: ProjectileHooks): void {
  hooksByKey.set(key, hooks);
}

export function getHooks(key: string | undefined): ProjectileHooks | undefined {
  return key === undefined ? undefined : hooksByKey.get(key);
}

/** Test seam: the number of compiled entries, for a sanity check at startup. */
export function registrySize(): { actions: number; hooks: number } {
  return { actions: actionsByKey.size, hooks: hooksByKey.size };
}
