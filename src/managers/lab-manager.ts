import { ColonyManager } from "../prototypes/types";
import { Logger } from "../utils/logger";

/** Stop producing a compound once we hold this much. */
export const COMPOUND_TARGET_AMOUNT = 3000;
/** Minimum of each reagent on hand before starting a reaction. */
export const REAGENT_MIN_AMOUNT = 500;
/** Input labs are restocked below this level. */
export const INPUT_LAB_TARGET = 1000;
/** Output labs are emptied above this level. */
export const OUTPUT_LAB_EMPTY_THRESHOLD = 500;
/** Labs keep this much energy on hand for boosting. */
export const LAB_ENERGY_TARGET = 1000;

/**
 * Compounds we want, in priority order — combat boosts for the creeps we field,
 * plus the OH / tier-2 chain that upgrades them.
 */
const PRODUCT_PRIORITIES: ResourceConstant[] = [
    "UH" as ResourceConstant, // +attack
    "KO" as ResourceConstant, // +ranged attack
    "LO" as ResourceConstant, // +heal
    "GO" as ResourceConstant, // +tough (damage reduction)
    "ZO" as ResourceConstant, // +move
    "OH" as ResourceConstant, // tier-2 ingredient
    "UH2O" as ResourceConstant,
    "KHO2" as ResourceConstant,
    "LHO2" as ResourceConstant,
    "GHO2" as ResourceConstant,
];

/** Boost compounds by body part, best first. */
const BOOSTS_BY_PART: { [part: string]: string[] } = {
    [ATTACK]: ["XUH2O", "UH2O", "UH"],
    [RANGED_ATTACK]: ["XKHO2", "KHO2", "KO"],
    [HEAL]: ["XLHO2", "LHO2", "LO"],
    [TOUGH]: ["XGHO2", "GHO2", "GO"],
    [MOVE]: ["XZHO2", "ZHO2", "ZO"],
};

export class LabManager {
    private colony: ColonyManager;

    constructor(colony: ColonyManager) {
        this.colony = colony;
    }

    private get systemInfo(): ColonyLabManagement {
        if (!this.colony.colonyInfo.labManagement) {
            this.colony.colonyInfo.labManagement = { nextUpdate: 0 };
        }
        return this.colony.colonyInfo.labManagement;
    }

    public run(): void {
        if (Game.time % 10 !== 0) return;

        const room = this.colony.getMainRoom();
        if (!room || !room.controller || (room.controller.level || 0) < 6) return;
        if (typeof room.find !== "function") return;

        const labs = room.find<StructureLab>(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_LAB,
        });
        if (labs.length < 3) return;

        const info = this.systemInfo;

        // (Re)assign roles and pick a reaction periodically
        if (Game.time >= (info.nextUpdate || 0)) {
            this.assignLabs(labs);
            this.selectReaction();
            info.nextUpdate = Game.time + 200;
        }

        this.runReactions(labs);
    }

    private assignLabs(labs: StructureLab[]): void {
        const info = this.systemInfo;
        const existing = (info.inputLabIds || []).filter(id => Game.getObjectById(id));
        if (existing.length === 2) return;

        // Pick the two labs with the most lab neighbors in range 2 as inputs,
        // so every output lab is likely in range of both.
        const scored = labs
            .map(lab => ({
                lab,
                neighbors: labs.filter(o => o.id !== lab.id && lab.pos.inRangeTo(o.pos, 2)).length,
            }))
            .sort((a, b) => b.neighbors - a.neighbors);

        info.inputLabIds = [scored[0].lab.id, scored[1].lab.id];
    }

    private selectReaction(): void {
        const info = this.systemInfo;
        const pairFor = LabManager.reagentsForProduct;
        let buyRequests: ResourceConstant[] | undefined;

        for (const product of PRODUCT_PRIORITIES) {
            if (this.getAvailable(product) >= COMPOUND_TARGET_AMOUNT) continue;

            const pair = pairFor(product);
            if (!pair) continue;

            const [a, b] = pair;
            const missing = [a, b].filter(r => this.getAvailable(r) < REAGENT_MIN_AMOUNT);

            if (missing.length === 0) {
                if (info.product !== product) {
                    Logger.info(`[Labs] ${this.colony.colonyInfo.id}: producing ${product} from ${a} + ${b}`);
                }
                info.product = product;
                info.reagents = [a, b];
                delete info.buyRequests;
                return;
            }

            // Remember what blocks the highest-priority product. Only raw
            // minerals are worth buying — compounds we can make ourselves.
            if (!buyRequests) {
                const rawMissing = missing.filter(r => r.length === 1);
                if (rawMissing.length > 0) {
                    buyRequests = rawMissing;
                }
            }
        }

        delete info.product;
        delete info.reagents;
        if (buyRequests) {
            info.buyRequests = buyRequests;
        } else {
            delete info.buyRequests;
        }
    }

    /** Looks up which two reagents react into the given product. */
    public static reagentsForProduct(product: ResourceConstant): [ResourceConstant, ResourceConstant] | null {
        for (const a in REACTIONS) {
            const row = REACTIONS[a];
            for (const b in row) {
                if (row[b] === product) {
                    return [a as ResourceConstant, b as ResourceConstant];
                }
            }
        }
        return null;
    }

    private getAvailable(resource: ResourceConstant): number {
        const room = this.colony.getMainRoom();
        let amount = 0;
        if (room.terminal) amount += room.terminal.store[resource] || 0;
        if (room.storage) amount += room.storage.store[resource] || 0;
        return amount;
    }

    private runReactions(labs: StructureLab[]): void {
        const info = this.systemInfo;
        if (!info.product || !info.reagents || !info.inputLabIds) return;

        const input1 = Game.getObjectById(info.inputLabIds[0]);
        const input2 = Game.getObjectById(info.inputLabIds[1]);
        if (!input1 || !input2) return;

        if ((input1.store[info.reagents[0]] || 0) < LAB_REACTION_AMOUNT) return;
        if ((input2.store[info.reagents[1]] || 0) < LAB_REACTION_AMOUNT) return;

        for (const lab of labs) {
            if (lab.id === input1.id || lab.id === input2.id) continue;
            if (lab.cooldown > 0) continue;
            if (lab.mineralType && lab.mineralType !== info.product) continue;
            lab.runReaction(input1, input2);
        }
    }

    /**
     * Finds a lab that can boost the given body part right now (enough compound
     * and energy for at least `partCount` parts).
     */
    public static findBoostLab(room: Room, part: BodyPartConstant, partCount: number): StructureLab | null {
        if (typeof room.find !== "function") return null;
        const compounds = BOOSTS_BY_PART[part];
        if (!compounds) return null;

        const labs = room.find<StructureLab>(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_LAB,
        });

        for (const compound of compounds) {
            const lab = labs.find(
                l =>
                    l.mineralType === compound &&
                    l.store[compound as ResourceConstant] >= LAB_BOOST_MINERAL * partCount &&
                    l.store[RESOURCE_ENERGY] >= LAB_BOOST_ENERGY * partCount,
            );
            if (lab) return lab;
        }
        return null;
    }
}
