/* eslint-disable max-classes-per-file */
import { CreepRunner } from "prototypes/creep";
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { RoomUtils } from "utils/room-utils";

export class ScoutCreep extends CreepRunner {
    public constructor(creep: Creep) {
        super(creep);
    }

    public override onRun(): void {
        const { creep, memory } = this;
        const colony = this.getColony();
        if (!colony) return;

        let targetRoomName = memory.workTargetId;

        // If no target or target is recently scouted, pick a new one
        const data = targetRoomName ? colony.colonyInfo.rooms[targetRoomName] : undefined;
        const needsNewTarget = !targetRoomName || (data && Game.time - (data.lastScouted || 0) < 500);

        if (needsNewTarget) {
            const newTarget = RoomUtils.findBestRoomToScout(colony);
            if (newTarget) {
                targetRoomName = newTarget;
                memory.workTargetId = newTarget;
            } else {
                delete memory.workTargetId;
                creep.say("No targets");
                return;
            }
        }

        if (!targetRoomName) return;

        if (creep.room.name !== targetRoomName) {
            this.moveToWithReservation({ pos: new RoomPosition(25, 25, targetRoomName) }, 0, 20);
            return;
        }

        // We are in the target room. updateRoomVisibility in CreepRunner already handles data update.
        // Scout specific: Sign controller
        const room = creep.room;
        if (room.controller) {
            if (!room.controller.sign || room.controller.sign.username !== "ScreepsAI") {
                if (
                    creep.signController(room.controller, "Remote Mining Territory of ScreepsAI") === ERR_NOT_IN_RANGE
                ) {
                    this.moveToWithReservation(room.controller, 0, 1);
                }
            }
        }

        creep.say("Scouting");
    }
}

export class ScoutCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(_energyBudgetRate: number, colony: ColonyManager): CreepProfiles {
        const room = colony.getMainRoom();
        if (!room || !room.controller || room.controller.level < 2) return {};

        const roomsNeedingScout = RoomUtils.getRoomsNeedingScout(colony);
        if (roomsNeedingScout.length === 0) return {};

        return {
            [CreepRole.SCOUT]: {
                desiredAmount: 1,
                bodyBlueprint: [MOVE],
                memoryBlueprint: {
                    role: CreepRole.SCOUT,
                    priority: 2,
                    workAmount: 0,
                    averageEnergyConsumptionProductionPerTick: 0,
                },
                priority: 2,
            },
        };
    }
}
