/**
 * How fast a colony spends energy it has banked above its reserve. A surplus is spread
 * over this many ticks, so a large stockpile turns into a large per-tick allowance
 * that shrinks as the stockpile is drawn down.
 */
export const ENERGY_DRAWDOWN_TICKS = 3000;

export interface EnergyBudgetInput {
    /** Net income per tick (gross production minus creep upkeep). May be negative. */
    productionRate: number;
    /** Energy in the primary store right now. */
    storedEnergy: number;
    /** Fill level of the primary store, 0..1. */
    storedEnergyPercent: number;
    /** Energy the colony keeps in reserve for towers, spawning and emergencies. */
    reserve: number;
}

export interface EnergyBudget {
    /** Share of income the colony may spend before any drawdown: 0.8 while banking, 1.0 once the reserve is met. */
    baseMultiplier: number;
    /** Energy above the reserve. */
    surplus: number;
    /** Extra per-tick allowance funded from the surplus. */
    drawdownRate: number;
    /** Total per-tick allowance the systems split between them. */
    spendableRate: number;
}

/**
 * Turns income and stock into a per-tick spending allowance.
 *
 * Income alone is a poor budget once a storage exists: a 1M store is never "full", so a
 * percentage ladder leaves hundreds of thousands of energy idle. Anything above the RCL
 * reserve is therefore treated as spendable and released over ENERGY_DRAWDOWN_TICKS.
 */
export function computeEnergyBudget(input: EnergyBudgetInput): EnergyBudget {
    const { productionRate, storedEnergy, storedEnergyPercent, reserve } = input;

    let baseMultiplier: number;
    if (storedEnergyPercent > 0.9) {
        baseMultiplier = 1.5;
    } else if (storedEnergyPercent > 0.8) {
        baseMultiplier = 1.1;
    } else if (storedEnergy >= reserve) {
        baseMultiplier = 1.0;
    } else {
        baseMultiplier = 0.8;
    }

    const surplus = Math.max(0, storedEnergy - reserve);
    const drawdownRate = surplus / ENERGY_DRAWDOWN_TICKS;
    const spendableRate = Math.max(0, productionRate * baseMultiplier + drawdownRate);

    return { baseMultiplier, surplus, drawdownRate, spendableRate };
}
