/* eslint-disable max-classes-per-file */
import { CreepRunner } from "prototypes/creep";
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { INPUT_LAB_TARGET, LAB_ENERGY_TARGET, OUTPUT_LAB_EMPTY_THRESHOLD } from "managers/lab-manager";

type LabTask =
    | { type: "empty"; lab: StructureLab; resource: ResourceConstant }
    | { type: "fill"; lab: StructureLab; resource: ResourceConstant };

/**
 * Keeps the lab pipeline flowing: loads reagents into input labs, empties
 * products (and stray minerals) into the terminal, and tops up lab energy
 * for boosting.
 */
export class LabHaulerCreep extends CreepRunner {
    public constructor(creep: Creep) {
        super(creep);
    }

    public override onRun(): void {
        const { creep } = this;
        const colony = this.getColony();
        const room = creep.room;
        const terminal = room.terminal;
        if (!colony || !terminal) return;

        const task = this.findTask(colony, room);

        if (!task) {
            if (creep.store.getUsedCapacity() > 0) {
                this.depositAll(terminal);
            } else if (!creep.pos.inRangeTo(terminal, 3)) {
                this.moveToWithReservation(terminal, 5, 2);
            }
            return;
        }

        if (task.type === "empty") {
            if (
                creep.store.getFreeCapacity() === 0 ||
                (creep.store.getUsedCapacity() > 0 && !creep.store[task.resource])
            ) {
                this.depositAll(terminal);
                return;
            }
            if (this.withdraw(task.lab, task.resource) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(task.lab, 5);
            }
            return;
        }

        // fill task
        if (creep.store[task.resource] > 0) {
            if (this.transfer(task.lab, task.resource) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(task.lab, 5);
            }
            return;
        }
        if (creep.store.getUsedCapacity() > 0) {
            this.depositAll(terminal);
            return;
        }

        const source = this.findSupply(room, task.resource);
        if (source) {
            if (this.withdraw(source, task.resource) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(source, 5);
            }
        }
    }

    private findTask(colony: ColonyManager, room: Room): LabTask | null {
        const info = colony.colonyInfo.labManagement;
        const labs = room.find<StructureLab>(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_LAB,
        });
        if (labs.length === 0) return null;

        const inputIds = info?.inputLabIds || [];
        const reagents = info?.reagents || [];
        const product = info?.product;

        for (const lab of labs) {
            const isInput = inputIds.includes(lab.id);
            const expected = isInput ? reagents[inputIds.indexOf(lab.id)] : product;

            // 1. Wrong mineral anywhere -> clear it out
            if (lab.mineralType && lab.mineralType !== expected) {
                return { type: "empty", lab, resource: lab.mineralType };
            }
        }

        // 2. Output labs with enough product -> bank it
        for (const lab of labs) {
            if (inputIds.includes(lab.id)) continue;
            if (product && lab.mineralType === product && lab.store[product] >= OUTPUT_LAB_EMPTY_THRESHOLD) {
                return { type: "empty", lab, resource: product };
            }
        }

        // 3. Input labs running low -> restock
        for (let i = 0; i < inputIds.length; i++) {
            const lab = Game.getObjectById(inputIds[i]);
            const reagent = reagents[i];
            if (!lab || !reagent) continue;
            if ((lab.store[reagent] || 0) < INPUT_LAB_TARGET && this.findSupply(room, reagent)) {
                return { type: "fill", lab, resource: reagent };
            }
        }

        // 4. Keep some energy in labs for boosting
        for (const lab of labs) {
            if (lab.store[RESOURCE_ENERGY] < LAB_ENERGY_TARGET && this.findSupply(room, RESOURCE_ENERGY)) {
                return { type: "fill", lab, resource: RESOURCE_ENERGY };
            }
        }

        return null;
    }

    private findSupply(room: Room, resource: ResourceConstant): StructureTerminal | StructureStorage | null {
        if (room.terminal && (room.terminal.store[resource] || 0) > 0) return room.terminal;
        if (room.storage && (room.storage.store[resource] || 0) > 0) return room.storage;
        return null;
    }

    private depositAll(terminal: StructureTerminal): void {
        const { creep } = this;
        for (const resourceType in creep.store) {
            const result = this.transfer(terminal, resourceType as ResourceConstant);
            if (result === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(terminal, 5);
                return;
            }
            if (result !== OK) return;
        }
    }
}

export class LabHaulerCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(_energyBudgetRate: number, colony: ColonyManager): CreepProfiles {
        const room = colony.getMainRoom();
        if (!room || !room.controller || (room.controller.level || 0) < 6) return {};
        if (!room.terminal || typeof room.find !== "function") return {};

        const labs = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_LAB,
        });
        if (labs.length < 3) return {};

        return {
            [CreepRole.LAB_HAULER]: {
                desiredAmount: 1,
                bodyBlueprint: [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE],
                memoryBlueprint: {
                    role: CreepRole.LAB_HAULER,
                    workDuration: 10,
                    averageEnergyConsumptionProductionPerTick: 0,
                },
                priority: 1,
            },
        };
    }
}
