/**
 * Minimal entity-component-system.
 *
 * - Entities are plain numeric ids.
 * - Components are plain data objects stored per type in a Map.
 * - Systems are functions run in a fixed order by the Scheduler.
 *
 * Game logic lives in systems and never touches Three.js; the render layer
 * reads component data and mirrors it into the scene.
 */

export type Entity = number;

export interface ComponentType<T> {
  readonly name: string;
  /** Phantom field so ComponentType<A> and ComponentType<B> are distinct types. */
  readonly __type?: T;
}

export function defineComponent<T>(name: string): ComponentType<T> {
  return { name };
}

/** Told when a watched component type is set or dropped on an entity (see World.watch). */
export interface ComponentWatcher<T> {
  /** `add()` ran for this entity and type (also when it replaces an existing value). */
  added(e: Entity, data: T): void;
  /** The component is gone: `remove()` or `destroy()`. */
  removed(e: Entity): void;
}

/** One component type's data. Watchers are only set on the few stores a system indexes (colliders). */
class Store extends Map<Entity, unknown> {
  watchers: ComponentWatcher<unknown>[] | null = null;
}

export class World {
  private nextId: Entity = 1;
  private readonly alive = new Set<Entity>();
  private readonly stores = new Map<ComponentType<unknown>, Store>();
  private readonly pendingDestroy: Entity[] = [];

  create(): Entity {
    const e = this.nextId++;
    this.alive.add(e);
    return e;
  }

  isAlive(e: Entity): boolean {
    return this.alive.has(e);
  }

  /** Destroys immediately. Use destroyDeferred() while iterating a query. */
  destroy(e: Entity): void {
    if (!this.alive.delete(e)) return;
    for (const store of this.stores.values()) {
      if (store.delete(e) && store.watchers) for (const w of store.watchers) w.removed(e);
    }
  }

  destroyDeferred(e: Entity): void {
    this.pendingDestroy.push(e);
  }

  flushDestroyed(): void {
    for (const e of this.pendingDestroy) this.destroy(e);
    this.pendingDestroy.length = 0;
  }

  get entityCount(): number {
    return this.alive.size;
  }

  add<T>(e: Entity, type: ComponentType<T>, data: T): T {
    if (!this.alive.has(e)) throw new Error(`World.add: entity ${e} is not alive`);
    const store = this.store(type);
    store.set(e, data);
    if (store.watchers) for (const w of store.watchers) w.added(e, data);
    return data;
  }

  remove<T>(e: Entity, type: ComponentType<T>): void {
    const store = this.stores.get(type);
    if (store?.delete(e) && store.watchers) for (const w of store.watchers) w.removed(e);
  }

  /** Get told about every add/remove of a component type; returns the function that stops it. */
  watch<T>(type: ComponentType<T>, watcher: ComponentWatcher<T>): () => void {
    const store = this.store(type);
    const w = watcher as ComponentWatcher<unknown>;
    (store.watchers ??= []).push(w);
    return () => {
      const list = store.watchers;
      if (!list) return;
      const i = list.indexOf(w);
      if (i >= 0) list.splice(i, 1);
      if (list.length === 0) store.watchers = null;
    };
  }

  get<T>(e: Entity, type: ComponentType<T>): T | undefined {
    return this.stores.get(type)?.get(e) as T | undefined;
  }

  /** Like get(), but throws if missing. Use when a query guarantees presence. */
  req<T>(e: Entity, type: ComponentType<T>): T {
    const value = this.get(e, type);
    if (value === undefined) throw new Error(`Entity ${e} is missing component ${type.name}`);
    return value;
  }

  /** True when the entity has no component other than `allowed` (it may lack some of them). */
  hasOnly(e: Entity, ...allowed: ComponentType<unknown>[]): boolean {
    for (const [type, store] of this.stores) if (store.has(e) && !allowed.includes(type)) return false;
    return true;
  }

  has(e: Entity, type: ComponentType<unknown>): boolean {
    return this.stores.get(type)?.has(e) ?? false;
  }

  /** All entities that have every listed component. Iterates the smallest store. */
  query(...types: ComponentType<unknown>[]): Entity[] {
    return this.fill([], types);
  }

  /**
   * Like query(), but fills `out` (cleared first) instead of allocating, and returns it. Still a snapshot, so
   * entities may be added or destroyed while the caller walks `out`. Don't share one `out` between a loop and
   * a callee that also fills it.
   */
  queryInto(out: Entity[], ...types: ComponentType<unknown>[]): Entity[] {
    return this.fill(out, types);
  }

  private fill(out: Entity[], types: readonly ComponentType<unknown>[]): Entity[] {
    out.length = 0;
    const smallest = this.smallestStore(types);
    if (smallest === undefined) return out;
    if (smallest === null) {
      for (const e of this.alive) out.push(e);
      return out;
    }
    // Resolve the other stores once; up to three types need no per-entity store lookup at all.
    const n = types.length;
    if (n === 1) {
      for (const e of smallest.keys()) out.push(e);
    } else if (n === 2) {
      const [s0, s1] = [this.stores.get(types[0]!)!, this.stores.get(types[1]!)!];
      for (const e of smallest.keys()) if (s0.has(e) && s1.has(e)) out.push(e);
    } else if (n === 3) {
      const [s0, s1, s2] = [this.stores.get(types[0]!)!, this.stores.get(types[1]!)!, this.stores.get(types[2]!)!];
      for (const e of smallest.keys()) if (s0.has(e) && s1.has(e) && s2.has(e)) out.push(e);
    } else {
      for (const e of smallest.keys()) {
        let all = true;
        for (let i = 0; i < n; i++) {
          if (!this.stores.get(types[i]!)!.has(e)) {
            all = false;
            break;
          }
        }
        if (all) out.push(e);
      }
    }
    return out;
  }

  /**
   * Calls fn for every entity that has all the listed components, without building an array. This walks the
   * live store, so destroy() mid-loop skips the not-yet-visited entity and an entity given the last component
   * mid-loop may or may not be visited; use query()/queryInto() when the body spawns same-shaped entities.
   */
  forEach(types: readonly ComponentType<unknown>[], fn: (e: Entity) => void): void {
    const smallest = this.smallestStore(types);
    if (smallest === undefined) return;
    if (smallest === null) {
      for (const e of this.alive) fn(e);
      return;
    }
    const n = types.length;
    if (n === 1) {
      for (const e of smallest.keys()) fn(e);
    } else if (n === 2) {
      const s0 = this.stores.get(types[0]!)!;
      const s1 = this.stores.get(types[1]!)!;
      for (const e of smallest.keys()) if (s0.has(e) && s1.has(e)) fn(e);
    } else {
      outer: for (const e of smallest.keys()) {
        for (let i = 0; i < n; i++) if (!this.stores.get(types[i]!)!.has(e)) continue outer;
        fn(e);
      }
    }
  }

  /** First entity matching the query, if any (handy for singletons like the player). */
  first(...types: ComponentType<unknown>[]): Entity | undefined {
    const smallest = this.smallestStore(types);
    if (smallest === undefined) return undefined;
    if (smallest === null) return this.alive.values().next().value;
    const n = types.length;
    outer: for (const e of smallest.keys()) {
      for (let i = 0; i < n; i++) if (!this.stores.get(types[i]!)!.has(e)) continue outer;
      return e;
    }
    return undefined;
  }

  /** The smallest store among `types`; null for no types (every entity); undefined if some store is empty. */
  private smallestStore(types: readonly ComponentType<unknown>[]): Store | null | undefined {
    if (types.length === 0) return null;
    let smallest: Store | undefined;
    for (let i = 0; i < types.length; i++) {
      const store = this.stores.get(types[i]!);
      if (!store || store.size === 0) return undefined;
      if (!smallest || store.size < smallest.size) smallest = store;
    }
    return smallest;
  }

  private store<T>(type: ComponentType<T>): Store {
    let store = this.stores.get(type);
    if (!store) {
      store = new Store();
      this.stores.set(type, store);
    }
    return store;
  }
}

export type System<Ctx> = (world: World, dt: number, ctx: Ctx) => void;

/** Runs systems in registration order every fixed tick. */
export class Scheduler<Ctx> {
  private readonly systems: { name: string; run: System<Ctx> }[] = [];
  /** Turn on to add up the wall time of every system in `times` (ms; the perf harness and the devtools read it). */
  profile = false;
  readonly times = new Map<string, number>();

  add(name: string, run: System<Ctx>): this {
    this.systems.push({ name, run });
    this.times.set(name, 0);
    return this;
  }

  get names(): string[] {
    return this.systems.map((s) => s.name);
  }

  tick(world: World, dt: number, ctx: Ctx): void {
    if (this.profile) {
      for (const system of this.systems) {
        const t0 = performance.now();
        system.run(world, dt, ctx);
        this.times.set(system.name, this.times.get(system.name)! + performance.now() - t0);
      }
    } else {
      for (const system of this.systems) system.run(world, dt, ctx);
    }
    world.flushDestroyed();
  }

  /** Zero the profile counters. */
  resetTimes(): void {
    for (const name of this.times.keys()) this.times.set(name, 0);
  }
}
