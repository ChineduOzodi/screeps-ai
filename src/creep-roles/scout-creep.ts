/* eslint-disable max-classes-per-file */
import { CreepRunner } from "prototypes/creep";
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { Logger } from "utils/logger";
import { RoomUtils } from "utils/room-utils";

/** Ticks a scout keeps trying to enter a room before it is written off as unreachable. */
export const SCOUT_GIVE_UP_TICKS = 300;

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
        let needsNewTarget = !targetRoomName || (data && Game.time - (data.lastScouted || 0) < 500);

        // A room behind zone walls or a sealed perimeter is never reached. Give up on it for a
        // while rather than pacing at the border for the rest of the creep's life.
        if (targetRoomName && !needsNewTarget && creep.room.name !== targetRoomName) {
            const since = memory.scoutTargetSince ?? Game.time;
            if (Game.time - since > SCOUT_GIVE_UP_TICKS) {
                const stale = colony.colonyInfo.rooms[targetRoomName] || { name: targetRoomName, alertLevel: 0 };
                stale.lastScoutAttempt = Game.time;
                colony.colonyInfo.rooms[targetRoomName] = stale;
                Logger.info(`[Scout] ${creep.name} could not reach ${targetRoomName}, skipping it for now`);
                needsNewTarget = true;
            }
        }

        if (needsNewTarget) {
            const newTarget = RoomUtils.findBestRoomToScout(colony);
            if (newTarget) {
                targetRoomName = newTarget;
                memory.workTargetId = newTarget;
                memory.scoutTargetSince = Game.time;
            } else {
                delete memory.workTargetId;
                delete memory.scoutTargetSince;
                creep.say("No targets");
                return;
            }
        }

        if (!targetRoomName) return;

        if (creep.room.name !== targetRoomName) {
            this.moveToWithReservation({ pos: new RoomPosition(25, 25, targetRoomName) }, 0, 20);
            return;
        }

        // We are in the target room. Force an immediate update of the room data to detect threats right away.
        RoomUtils.updateRoomData(colony, creep.room);

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

        // An observer scouts for free — no need for scout creeps.
        if (typeof room.find === "function") {
            const hasObserver =
                room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_OBSERVER }).length > 0;
            if (hasObserver) return {};
        }

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
