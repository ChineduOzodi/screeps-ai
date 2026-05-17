import { ColonyManager } from "prototypes/types";
import { EnergyCalculator } from "utils/energy-calculator";
import { ThreatAssessment } from "utils/threat-assessment";

export class RoomUtils {
    public static updateRoomData(colony: ColonyManager, room: Room): void {
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
    }

    public static getRoomsNeedingScout(colony: ColonyManager): string[] {
        const mainRoom = colony.getMainRoom();
        if (!mainRoom) return [];

        const adjacentRooms = Object.values(Game.map.describeExits(mainRoom.name));
        const knownRooms = Object.keys(colony.colonyInfo.rooms);
        const allPotentialRooms = Array.from(new Set([...adjacentRooms, ...knownRooms]));

        return allPotentialRooms.filter(roomName => {
            const data = colony.colonyInfo.rooms[roomName];
            // Scout if no data, no vision, or scouted too long ago
            return !data || !Game.rooms[roomName] || Game.time - (data.lastScouted || 0) > 1000;
        });
    }

    public static findBestRoomToScout(colony: ColonyManager): string | undefined {
        const roomsToScout = this.getRoomsNeedingScout(colony);
        if (roomsToScout.length === 0) return undefined;

        // Sort by lastScouted (ascending) to pick the oldest one
        return roomsToScout.sort((a, b) => {
            const dataA = colony.colonyInfo.rooms[a];
            const dataB = colony.colonyInfo.rooms[b];
            return (dataA?.lastScouted || 0) - (dataB?.lastScouted || 0);
        })[0];
    }
}
