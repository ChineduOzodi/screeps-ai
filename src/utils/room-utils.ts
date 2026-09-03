import { ColonyManager } from "prototypes/types";
import { EnergyCalculator } from "utils/energy-calculator";
import { ThreatAssessment } from "utils/threat-assessment";

export class RoomUtils {
    /**
     * Hostile structures the defense should actually fight. FIND_HOSTILE_STRUCTURES also
     * returns power banks, keeper lairs and controllers, none of which are threats.
     */
    public static isDefenseTarget(structure: Structure): boolean {
        return structure.structureType === STRUCTURE_INVADER_CORE;
    }

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
                // Scale alert with the size of the incursion so the defender
                // response (which is derived from alertLevel) scales too.
                alertLevel = 2 + Math.min(3, Math.floor((threat.attackPower + threat.healPower) / 200));
            } else {
                alertLevel = 1;
            }
        }
        // Invader cores are the only structures worth an armed response. Power banks and
        // keeper lairs also report a hostile owner, but they are not a threat to us.
        const invaderCores = room.find(FIND_HOSTILE_STRUCTURES, { filter: RoomUtils.isDefenseTarget });
        if (invaderCores.length > 0) {
            alertLevel = Math.max(alertLevel, 2);
        }

        roomData.alertLevel = alertLevel;
        colony.colonyInfo.rooms[room.name] = roomData;
    }

    public static getRoomsNeedingScout(colony: ColonyManager): string[] {
        const mainRoom = colony.getMainRoom();
        if (!mainRoom) return [];

        const adjacentRooms = Game.map.describeExits(mainRoom.name)
            ? Object.values(Game.map.describeExits(mainRoom.name) as Record<string, string>)
            : [];
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
