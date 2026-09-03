/**
 * CPU budget: decides how much CPU this tick may spend and which work can wait.
 *
 * Everything scales from Game.cpu.limit (20 on a fresh MMO account, 100 in seasons)
 * and Game.cpu.bucket, the bank of unspent CPU. A full bank lets a tick burst past
 * the limit to catch up on deferred work; a draining bank pulls optional work back
 * until the bank recovers. Nothing here is tied to a fixed CPU number.
 */

export type CpuMode = "surplus" | "normal" | "conserve" | "critical";

export interface CpuLimits {
    limit: number;
    bucket: number;
    tickLimit: number;
}

export interface CpuPlan {
    mode: CpuMode;
    /** CPU this tick may spend in total. */
    target: number;
    /** Work that only matters when CPU is plentiful (visuals, extra scouting). */
    optional: boolean;
    /** Multiplier applied to periodic jobs' base intervals. */
    intervalScale: number;
}

export interface CpuStats {
    used: number;
    limit: number;
    bucket: number;
    tickLimit: number;
    mode: CpuMode;
    target: number;
    /** Creeps whose role logic was skipped this tick to stay inside the budget. */
    deferredCreeps: number;
    /** Exponential moving average of CPU used per tick. */
    average: number;
    /** CPU spent per named phase this tick. */
    phases: { [name: string]: number };
    tick: number;
}

/** Bucket levels that move the budget between modes. The bank holds 10,000 at most. */
export const BUCKET_SURPLUS = 9000;
export const BUCKET_CONSERVE = 5000;
export const BUCKET_CRITICAL = 2000;
/** Bank a pixel costs on the official server; only worth it when opted in. */
const PIXEL_BUCKET_COST = 10000;
const AVERAGE_WINDOW = 100;

export class CpuBudget {
    private static plan: CpuPlan = { mode: "normal", target: 20, optional: true, intervalScale: 1 };
    private static deferredCreeps = 0;
    private static phases: { [name: string]: number } = {};
    /** False until the first tick after a global reset has passed; that tick's compile cost is not typical. */
    private static warmedUp = false;

    /** Pure planning step so tests can pin the mode boundaries. */
    public static planFor(cpu: CpuLimits): CpuPlan {
        const { limit, bucket, tickLimit } = cpu;
        if (bucket >= BUCKET_SURPLUS) {
            // Spend the bank down slowly: 1.5x the limit still leaves a margin under tickLimit.
            return {
                mode: "surplus",
                target: Math.min(tickLimit * 0.9, limit * 1.5),
                optional: true,
                intervalScale: 1,
            };
        }
        if (bucket >= BUCKET_CONSERVE) {
            return { mode: "normal", target: limit, optional: true, intervalScale: 1 };
        }
        if (bucket >= BUCKET_CRITICAL) {
            return { mode: "conserve", target: limit * 0.8, optional: false, intervalScale: 2 };
        }
        return { mode: "critical", target: limit * 0.5, optional: false, intervalScale: 5 };
    }

    /** Call first thing in the loop. */
    public static startTick(): void {
        CpuBudget.plan = CpuBudget.planFor(CpuBudget.readLimits());
        CpuBudget.deferredCreeps = 0;
        CpuBudget.phases = {};
    }

    public static get mode(): CpuMode {
        return CpuBudget.plan.mode;
    }

    public static get target(): number {
        return CpuBudget.plan.target;
    }

    /** True while optional work (visuals, cosmetic bookkeeping) is affordable. */
    public static optionalAllowed(): boolean {
        if (typeof Memory !== "undefined" && Memory.settings?.visuals === false) return false;
        return CpuBudget.plan.optional;
    }

    /** CPU left under this tick's target. */
    public static remaining(): number {
        return CpuBudget.plan.target - CpuBudget.used();
    }

    /**
     * Periodic jobs call this instead of `Game.time % base === 0`. Under pressure the
     * interval stretches, so a planner that ran every 10 ticks runs every 20 or 50.
     */
    public static every(base: number): boolean {
        const interval = Math.max(1, Math.round(base * CpuBudget.plan.intervalScale));
        const time = typeof Game.time === "number" ? Game.time : 0;
        return time % interval === 0;
    }

    /**
     * Whether a deferrable creep may still run its role logic. Keeps a slice of the
     * budget free for the rooms and bookkeeping that run after the creeps.
     */
    public static canRunDeferrable(): boolean {
        const reserve = CpuBudget.readLimits().limit * 0.15;
        return CpuBudget.remaining() > reserve;
    }

    public static noteDeferredCreep(): void {
        CpuBudget.deferredCreeps++;
    }

    /** Runs a phase and records what it cost. */
    public static measure<T>(name: string, fn: () => T): T {
        const before = CpuBudget.used();
        try {
            return fn();
        } finally {
            CpuBudget.phases[name] = (CpuBudget.phases[name] || 0) + (CpuBudget.used() - before);
        }
    }

    /** Call last: writes stats to Memory and spends a full bank on a pixel when opted in. */
    public static endTick(): void {
        const limits = CpuBudget.readLimits();
        const used = CpuBudget.used();

        if (!Memory.stats) Memory.stats = {};
        const previous = Memory.stats.cpu;
        let average: number;
        if (!CpuBudget.warmedUp) {
            // A global reset tick includes compiling the whole script; keep it out of the average.
            CpuBudget.warmedUp = true;
            average = previous ? previous.average : 0;
        } else if (previous && previous.average > 0) {
            average = previous.average + (used - previous.average) / AVERAGE_WINDOW;
        } else {
            average = used;
        }

        Memory.stats.cpu = {
            used: Math.round(used * 100) / 100,
            limit: limits.limit,
            bucket: limits.bucket,
            tickLimit: limits.tickLimit,
            mode: CpuBudget.plan.mode,
            target: Math.round(CpuBudget.plan.target * 100) / 100,
            deferredCreeps: CpuBudget.deferredCreeps,
            average: Math.round(average * 100) / 100,
            phases: CpuBudget.roundAll(CpuBudget.phases),
            tick: Game.time,
        };

        if (
            Memory.settings?.generatePixels &&
            limits.bucket >= PIXEL_BUCKET_COST &&
            typeof Game.cpu.generatePixel === "function"
        ) {
            Game.cpu.generatePixel();
        }
    }

    private static used(): number {
        return typeof Game.cpu?.getUsed === "function" ? Game.cpu.getUsed() : 0;
    }

    private static readLimits(): CpuLimits {
        const cpu = Game.cpu || ({} as CPU);
        const limit = typeof cpu.limit === "number" ? cpu.limit : 20;
        return {
            limit,
            bucket: typeof cpu.bucket === "number" ? cpu.bucket : 10000,
            tickLimit: typeof cpu.tickLimit === "number" ? cpu.tickLimit : limit,
        };
    }

    private static roundAll(phases: { [name: string]: number }): { [name: string]: number } {
        const out: { [name: string]: number } = {};
        for (const name in phases) out[name] = Math.round(phases[name] * 100) / 100;
        return out;
    }
}
