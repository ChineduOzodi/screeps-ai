/* eslint-disable max-classes-per-file */
import { CreepRunner } from "prototypes/creep";
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { Logger } from "utils/logger";

/**
 * Travels to the colony's expansion target room and claims its controller.
 */
export class ClaimerCreep extends CreepRunner {
    public constructor(creep: Creep) {
        super(creep);
    }

    public override onRun(): void {
        const { creep, memory } = this;
        const targetRoomName = memory.workTargetId;

        if (!targetRoomName) {
            creep.say("No target");
            return;
        }

        if (creep.room.name !== targetRoomName) {
            this.moveToWithReservation({ pos: new RoomPosition(25, 25, targetRoomName) }, 0, 20);
            return;
        }

        const controller = creep.room.controller;
        if (!controller) {
            Logger.warning(`[Claimer] ${creep.name}: target room ${targetRoomName} has no controller`);
            return;
        }

        if (controller.my) {
            creep.say("Claimed!");
            return;
        }

        const result = creep.claimController(controller);
        if (result === ERR_NOT_IN_RANGE) {
            this.moveToWithReservation(controller, 0, 1);
        } else if (result === ERR_GCL_NOT_ENOUGH) {
            creep.say("GCL low");
        } else if (result === OK) {
            Logger.info(`[Claimer] Claimed room ${targetRoomName} for colony ${memory.colonyId}`);
        }
    }
}

export class ClaimerCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(_energyBudgetRate: number, colony: ColonyManager): CreepProfiles {
        const expansion = colony.colonyInfo.expansionManagement;
        const target = expansion?.expansionTarget;
        if (!target) return {};

        // Already claimed? No claimer needed.
        const targetRoom = Game.rooms[target];
        if (targetRoom?.controller?.my) return {};

        // Can't afford the claim body
        if (colony.getMainRoom().energyCapacityAvailable < 650) return {};

        return {
            [`${CreepRole.CLAIMER}-${target}`]: {
                desiredAmount: 1,
                bodyBlueprint: [CLAIM, MOVE],
                memoryBlueprint: {
                    role: CreepRole.CLAIMER,
                    workTargetId: target,
                    workDuration: 0,
                    averageEnergyConsumptionProductionPerTick: 0,
                },
                priority: 4,
            },
        };
    }
}
