/* eslint-disable max-classes-per-file */
import { CreepRunner } from "prototypes/creep";
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";

export class ExtensionFillerCreep extends CreepRunner {
    public constructor(creep: Creep) {
        super(creep);
    }

    public override onRun(): void {
        const { creep, memory } = this;

        // Cycle state
        if (memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            memory.working = false;
        }
        if (!memory.working && creep.store.getFreeCapacity() === 0) {
            memory.working = true;
        }

        if (memory.working) {
            this.deliverEnergy();
        } else {
            this.gatherEnergy();
        }
    }

    private gatherEnergy() {
        const { creep } = this;
        const colony = this.getColony();
        if (!colony) return;

        const storage = colony.getPrimaryStorage();
        // We only want to pull from Storage (not containers) if possible,
        // but getPrimaryStorage() might return a container if Storage isn't built.
        // The spawner ensures we only exist if Storage is built.
        if (storage && storage.structureType === STRUCTURE_STORAGE) {
            if (this.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(storage, 5);
            }
        } else {
            // Fallback to container if needed, but primarily we want Storage
            if (storage && storage.store[RESOURCE_ENERGY] > 0) {
                if (this.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    this.moveToWithReservation(storage, 5);
                }
            }
        }
    }

    private deliverEnergy() {
        const { creep } = this;

        // Target: Spawns and Extensions
        const target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s =>
                (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
                s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
        });

        if (target) {
            if (this.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(target, 5);
            }
        } else {
            // Priority 2: Towers
            const tower = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
            });
            if (tower) {
                if (this.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    this.moveToWithReservation(tower, 5);
                }
            } else {
                // Idle near storage
                const colony = this.getColony();
                const storage = colony?.getPrimaryStorage();
                if (storage && !creep.pos.inRangeTo(storage, 3)) {
                    this.moveToWithReservation(storage, 5, 2);
                }
            }
        }
    }
}

export class ExtensionFillerCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(energyBudgetRate: number, colony: ColonyManager): CreepProfiles {
        const colonySpawns: CreepProfiles = {};
        const room = colony.getMainRoom();

        // Only spawn if Storage is constructed
        if (!room.storage || !room.storage.isActive()) {
            return colonySpawns;
        }

        const priority = 9; // High priority, just below defense/harvesters
        // Use a reduced energy cap to ensure the filler can spawn even if extensions are not 100% full.
        // Capping at 800 energy (8 CARRY/8 MOVE) is sufficient for local transport.
        const targetEnergy = Math.min(room.energyCapacityAvailable * 0.7, 800);
        colonySpawns[CreepRole.EXTENSION_FILLER] = this.createProfile(targetEnergy, colony, priority);

        return colonySpawns;
    }

    private createProfile(energyCap: number, colony: ColonyManager, priority: number) {
        // Body: Simple CARRY/MOVE.
        // We don't need a huge creep, but enough to fill extensions quickly.
        // At RCL 4 (Storage), capacity is 1300.
        // Let's aim for 400-800 capacity.

        let carryParts = Math.floor(energyCap / 100); // 1 CARRY + 1 MOVE = 100
        carryParts = Math.min(carryParts, 16); // 800 capacity (16 CARRY + 16 MOVE = 32 parts)
        if (carryParts < 2) carryParts = 2;

        const body: BodyPartConstant[] = [];
        for (let i = 0; i < carryParts; i++) {
            body.push(CARRY);
            body.push(MOVE);
        }

        const memory: AddCreepToQueueOptions = {
            workTargetId: colony.getMainRoom().name,
            workAmount: 0,
            averageEnergyConsumptionProductionPerTick: 0,
            workDuration: 100,
            role: CreepRole.EXTENSION_FILLER,
        };

        const creepSpawnManagement: CreepSpawnerProfileInfo = {
            desiredAmount: 1,
            bodyBlueprint: body,
            memoryBlueprint: memory,
            priority,
        };
        return creepSpawnManagement;
    }
}
