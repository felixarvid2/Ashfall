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

export class World {
  private nextId: Entity = 1;
  private readonly alive = new Set<Entity>();
  private readonly stores = new Map<ComponentType<unknown>, Map<Entity, unknown>>();
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
    for (const store of this.stores.values()) store.delete(e);
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
    this.store(type).set(e, data);
    return data;
  }

  remove<T>(e: Entity, type: ComponentType<T>): void {
    this.stores.get(type)?.delete(e);
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

  has(e: Entity, type: ComponentType<unknown>): boolean {
    return this.stores.get(type)?.has(e) ?? false;
  }

  /** All entities that have every listed component. Iterates the smallest store. */
  query(...types: ComponentType<unknown>[]): Entity[] {
    if (types.length === 0) return [...this.alive];
    let smallest: Map<Entity, unknown> | undefined;
    for (const type of types) {
      const store = this.stores.get(type);
      if (!store || store.size === 0) return [];
      if (!smallest || store.size < smallest.size) smallest = store;
    }
    const result: Entity[] = [];
    for (const e of smallest!.keys()) {
      if (types.every((t) => this.stores.get(t)!.has(e))) result.push(e);
    }
    return result;
  }

  /** First entity matching the query, if any (handy for singletons like the player). */
  first(...types: ComponentType<unknown>[]): Entity | undefined {
    return this.query(...types)[0];
  }

  private store<T>(type: ComponentType<T>): Map<Entity, T> {
    let store = this.stores.get(type);
    if (!store) {
      store = new Map();
      this.stores.set(type, store);
    }
    return store as Map<Entity, T>;
  }
}

export type System<Ctx> = (world: World, dt: number, ctx: Ctx) => void;

/** Runs systems in registration order every fixed tick. */
export class Scheduler<Ctx> {
  private readonly systems: { name: string; run: System<Ctx> }[] = [];

  add(name: string, run: System<Ctx>): this {
    this.systems.push({ name, run });
    return this;
  }

  get names(): string[] {
    return this.systems.map((s) => s.name);
  }

  tick(world: World, dt: number, ctx: Ctx): void {
    for (const system of this.systems) system.run(world, dt, ctx);
    world.flushDestroyed();
  }
}
