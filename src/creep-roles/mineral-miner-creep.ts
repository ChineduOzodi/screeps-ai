/* eslint-disable max-classes-per-file */
import { CreepRunner } from "prototypes/creep";
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";

/**
 * Mines the room's mineral (via an extractor) and hauls it to the terminal,
 * falling back to storage. Only spawned when the extractor exists and the
 * mineral has anything left.
 */
export class MineralMinerCreep extends CreepRunner {
    public constructor(creep: Creep) {
        super(creep);
    }

    public override onRun(): void {
        const { creep, memory } = this;

        if (memory.working && creep.store.getUsedCapacity() === 0) {
            memory.working = false;
        }
        if (!memory.working && creep.store.getFreeCapacity() === 0) {
            memory.working = true;
        }

        if (memory.working) {
            this.deliverMinerals();
        } else {
            this.mineMineral();
        }
    }

    private mineMineral(): void {
        const { creep, memory } = this;
        const mineral = memory.workTargetId ? Game.getObjectById<Mineral>(memory.workTargetId as Id<Mineral>) : null;

        if (!mineral || mineral.mineralAmount === 0) {
            // Nothing left to mine; dump what we carry and idle.
            if (creep.store.getUsedCapacity() > 0) {
                memory.working = true;
            } else {
                creep.say("depleted");
            }
            return;
        }

        if (this.harvest(mineral) === ERR_NOT_IN_RANGE) {
            this.moveToWithReservation(mineral, creep.memory.workDuration, 1);
        }
    }

    private deliverMinerals(): void {
        const { creep } = this;
        const room = creep.room;

        const target =
            room.terminal && room.terminal.isActive() && room.terminal.store.getFreeCapacity() > 0
                ? room.terminal
                : room.storage;

        if (!target) {
            creep.say("no dropoff");
            return;
        }

        for (const resourceType in creep.store) {
            const result = this.transfer(target, resourceType as ResourceConstant);
            if (result === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(target, creep.memory.workDuration, 1);
                return;
            }
            if (result !== OK) return;
        }
    }
}

export class MineralMinerCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(_energyBudgetRate: number, colony: ColonyManager): CreepProfiles {
        const room = colony.getMainRoom();
        if (!room || !room.controller || room.controller.level < 6) return {};

        // Need somewhere to put the minerals
        if (!room.storage && !room.terminal) return {};

        const minerals = room.find(FIND_MINERALS);
        const profiles: CreepProfiles = {};

        for (const mineral of minerals) {
            if (mineral.mineralAmount === 0) continue;

            const hasExtractor = mineral.pos
                .lookFor(LOOK_STRUCTURES)
                .some(s => s.structureType === STRUCTURE_EXTRACTOR);
            if (!hasExtractor) continue;

            profiles[`${CreepRole.MINERAL_MINER}-${mineral.id}`] = this.createProfile(mineral, colony);
        }

        return profiles;
    }

    private createProfile(mineral: Mineral, colony: ColonyManager): CreepSpawnerProfileInfo {
        const energyCap = colony.getMainRoom().energyCapacityAvailable;

        // [WORK, WORK, CARRY, MOVE] units: mine fast, haul in batches.
        const unitCost = 300;
        let units = Math.floor(energyCap / unitCost);
        units = Math.min(units, 8);
        if (units < 1) units = 1;

        const body: BodyPartConstant[] = [];
        for (let i = 0; i < units; i++) {
            body.push(WORK, WORK, CARRY, MOVE);
        }

        return {
            desiredAmount: 1,
            bodyBlueprint: body,
            memoryBlueprint: {
                role: CreepRole.MINERAL_MINER,
                workTargetId: mineral.id,
                workDuration: 20,
                averageEnergyConsumptionProductionPerTick: 0,
            },
            priority: 1, // Low priority — economy and defense come first
        };
    }
}
