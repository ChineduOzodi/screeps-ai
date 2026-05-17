/* eslint-disable max-classes-per-file */
import { CreepRunner } from "prototypes/creep";
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { ThreatAssessment } from "utils/threat-assessment";
import { EnergyCalculator } from "utils/energy-calculator";

export class ScoutCreep extends CreepRunner {
    public constructor(creep: Creep) {
        super(creep);
    }

    public override onRun(): void {
        const { creep, memory } = this;
        const targetRoomName = memory.workTargetId; // We use workTargetId as roomName for Scout

        if (!targetRoomName) {
            creep.say("No target");
            return;
        }

        if (creep.room.name !== targetRoomName) {
            this.moveToWithReservation({ pos: new RoomPosition(25, 25, targetRoomName) }, 0, 20);
            return;
        }

        // We are in the target room. Update room info.
        const colony = this.getColony();
        if (!colony) return;

        const room = creep.room;
        const roomData = colony.colonyInfo.rooms[room.name] || { name: room.name, alertLevel: 0 };

        // Update metadata
        roomData.sourceCount = room.find(FIND_SOURCES).length;
        roomData.lastScouted = Game.time;

        // Calculate distance to main spawn
        const spawn = colony.getMainSpawn();
        if (spawn && (!roomData.distance || Game.time % 1000 === 0)) {
            roomData.distance = EnergyCalculator.calculateTravelTime(spawn.pos, new RoomPosition(25, 25, room.name));
        }

        // Owner/Reservation
        if (room.controller) {
            roomData.owner = room.controller.owner?.username;
            roomData.reservation = room.controller.reservation?.username;

            // Sign controller
            if (!room.controller.sign || room.controller.sign.username !== "ScreepsAI") {
                if (
                    creep.signController(room.controller, "Remote Mining Territory of ScreepsAI") === ERR_NOT_IN_RANGE
                ) {
                    this.moveToWithReservation(room.controller, 0, 1);
                }
            }
        }

        // Other resources
        const minerals = room.find(FIND_MINERALS);
        if (minerals.length > 0) {
            roomData.otherResources = minerals.map(m => m.mineralType);
        }

        // Threat Assessment
        const threat = ThreatAssessment.assess(room);
        let alertLevel = 0;
        if (threat.totalHostiles > 0) {
            if (threat.attackPower > 0 || threat.healPower > 0) {
                alertLevel = 2;
            } else {
                alertLevel = 1;
            }
        }
        // Also check for hostile structures (invader cores, etc.)
        const hostileStructures = room.find(FIND_HOSTILE_STRUCTURES);
        if (hostileStructures.length > 0) {
            alertLevel = 2;
        }

        roomData.alertLevel = alertLevel;
        colony.colonyInfo.rooms[room.name] = roomData;

        creep.say(`Alert: ${alertLevel}`);
    }
}

export class ScoutCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(_energyBudgetRate: number, colony: ColonyManager): CreepProfiles {
        const room = colony.getMainRoom();
        if (!room || !room.controller || room.controller.level < 3) return {};
        if (!colony.getPrimaryStorage()) return {};

        const profiles: CreepProfiles = {};
        const adjacentRooms = Object.values(Game.map.describeExits(room.name));

        const roomsToScout = adjacentRooms.filter(roomName => {
            const data = colony.colonyInfo.rooms[roomName];
            // Check if we need to scout this room
            return !data || !Game.rooms[roomName] || Game.time - (data.lastScouted || 0) > 1000;
        });

        roomsToScout.forEach(roomName => {
            profiles[`${CreepRole.SCOUT}-${roomName}`] = {
                desiredAmount: 1,
                bodyBlueprint: [MOVE],
                memoryBlueprint: {
                    role: CreepRole.SCOUT,
                    workTargetId: roomName,
                    priority: 2,
                    workAmount: 0,
                    averageEnergyConsumptionProductionPerTick: 0,
                },
                priority: 2,
            };
        });

        return profiles;
    }
}
