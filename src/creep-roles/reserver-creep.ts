/* eslint-disable max-classes-per-file */
import { CreepRunner } from "prototypes/creep";
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";

export class ReserverCreep extends CreepRunner {
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

        if (creep.room.controller) {
            const result = creep.reserveController(creep.room.controller);
            if (result === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(creep.room.controller, 0, 1);
            } else if (result === OK) {
                creep.say("Reserving");
            }
        }
    }
}

export class ReserverCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(_energyBudgetRate: number, colony: ColonyManager): CreepProfiles {
        const colonySpawns: CreepProfiles = {};
        const rooms = colony.colonyInfo.rooms;

        Object.keys(rooms).forEach(roomName => {
            const roomData = rooms[roomName];
            if (roomData.isMain) return;
            if (roomData.alertLevel > 1) return;

            // Only reserve if we have vision and it's neutral
            const room = Game.rooms[roomName];
            if (room && room.controller && !room.controller.owner) {
                // Determine if we need a reserver
                const reservation = room.controller.reservation;
                const ticksToEnd = reservation ? reservation.ticksToEnd : 0;

                // If reservation is low or not ours, spawn one
                // We also check if we are already spawning one or if one is alive
                if (
                    ticksToEnd < 4000 ||
                    (reservation &&
                        !room.controller.my &&
                        reservation.username !== colony.getMainSpawn().owner.username)
                ) {
                    colonySpawns[`${CreepRole.RESERVER}-${roomName}`] = this.createProfile(roomName, colony);
                }
            }
        });

        return colonySpawns;
    }

    private createProfile(roomName: string, colony: ColonyManager): CreepSpawnerProfileInfo {
        const energyCap = colony.getMainRoom().energyCapacityAvailable;

        // 1 CLAIM (600) + 1 MOVE (50) = 650 energy
        let claimParts = Math.floor(energyCap / 650);
        if (claimParts > 2) claimParts = 2; // Usually 2 is enough for remote
        if (claimParts < 1) claimParts = 1;

        const body: BodyPartConstant[] = [];
        for (let i = 0; i < claimParts; i++) {
            body.push(CLAIM);
            body.push(MOVE);
        }

        return {
            desiredAmount: 1,
            bodyBlueprint: body,
            memoryBlueprint: {
                role: CreepRole.RESERVER,
                workTargetId: roomName,
                priority: 3,
                workAmount: claimParts,
                averageEnergyConsumptionProductionPerTick: 0,
            },
            priority: 3,
        };
    }
}
