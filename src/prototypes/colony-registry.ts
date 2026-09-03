import { ColonyManagerImpl } from "./colony";

/**
 * One ColonyManagerImpl per colony per tick.
 *
 * Building a colony manager constructs every system and manager under it, so doing
 * it once per creep (as the creep loop used to) multiplied that cost by the creep
 * count every tick. Instances only live for the tick: colony memory is the source
 * of truth, so a fresh instance next tick sees every change.
 */
export class ColonyRegistry {
    private static tick = -1;
    private static colonies: { [id: string]: ColonyManagerImpl } = {};

    public static get(id: string): ColonyManagerImpl | undefined {
        ColonyRegistry.rollTick();
        const cached = ColonyRegistry.colonies[id];
        if (cached) return cached;

        const data = Memory.colonies[id];
        if (!data) return undefined;
        const colony = new ColonyManagerImpl(data);
        ColonyRegistry.colonies[id] = colony;
        return colony;
    }

    /** Forgets this tick's instances (tests, or after a colony is deleted mid-tick). */
    public static reset(): void {
        ColonyRegistry.tick = -1;
        ColonyRegistry.colonies = {};
    }

    private static rollTick(): void {
        if (ColonyRegistry.tick === Game.time) return;
        ColonyRegistry.tick = Game.time;
        ColonyRegistry.colonies = {};
    }
}
