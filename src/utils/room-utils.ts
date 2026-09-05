import { ColonyManager } from "prototypes/types";
import { EnergyCalculator } from "utils/energy-calculator";
import { ThreatAssessment } from "utils/threat-assessment";

/** Ticks between scout visits to a room. */
export const SCOUT_INTERVAL = 1000;
/**
 * Ticks between scout visits to a room another player owns with towers. The scout is a
 * single MOVE part and rarely survives the visit, so the intel is refreshed less often.
 */
export const HOSTILE_SCOUT_INTERVAL = 5000;
/** Exit hops from the main room that a colony keeps intel on. */
export const SCOUT_DEPTH = 2;

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
        RoomUtils.recordOwnerIntel(roomData, room);

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

    /**
     * Remembers what another player has in a room they own: controller level, towers, spawns
     * and safe mode. This is the intel any decision to attack (or to avoid them) starts from.
     */
    private static recordOwnerIntel(roomData: RoomData, room: Room): void {
        const controller = room.controller;
        if (!controller || !controller.owner || controller.my) {
            delete roomData.controllerLevel;
            delete roomData.towerCount;
            delete roomData.spawnCount;
            delete roomData.safeModeUntil;
            return;
        }

        const hostileStructures = room.find(FIND_HOSTILE_STRUCTURES);
        roomData.controllerLevel = controller.level;
        roomData.towerCount = hostileStructures.filter(s => s.structureType === STRUCTURE_TOWER).length;
        roomData.spawnCount = hostileStructures.filter(s => s.structureType === STRUCTURE_SPAWN).length;
        if (controller.safeMode) {
            roomData.safeModeUntil = Game.time + controller.safeMode;
        } else {
            delete roomData.safeModeUntil;
        }
    }

    /** Room status from the map API; "normal" on servers without the call. */
    public static getRoomStatus(roomName: string): string {
        const map = Game.map as { getRoomStatus?: (name: string) => { status: string } | undefined } | undefined;
        if (!map || typeof map.getRoomStatus !== "function") return "normal";
        const status = map.getRoomStatus(roomName);
        return status?.status || "normal";
    }

    /**
     * Whether creeps from `fromRoom` can get to `roomName`. Novice and respawn areas are
     * walled off from the rest of the map, so a room only counts as reachable while both
     * rooms share the same status; closed rooms are never reachable.
     */
    public static isRoomReachable(fromRoom: string, roomName: string): boolean {
        const target = RoomUtils.getRoomStatus(roomName);
        if (target === "closed") return false;
        return target === RoomUtils.getRoomStatus(fromRoom);
    }

    /** Exit neighbours of a room, or none when the map API has nothing for it. */
    public static getExits(roomName: string): string[] {
        const map = Game.map as { describeExits?: (name: string) => Record<string, string> | null } | undefined;
        if (!map || typeof map.describeExits !== "function") return [];
        const exits = map.describeExits(roomName);
        return exits ? Object.values(exits) : [];
    }

    /** What any colony remembers about a room. */
    public static findRoomData(roomName: string): RoomData | undefined {
        const colonies = Memory.colonies || {};
        for (const colonyId in colonies) {
            const data = colonies[colonyId]?.rooms?.[roomName];
            if (data) return data;
        }
        return undefined;
    }

    /** Exit neighbours of a room that another player owns, per what any colony has scouted. */
    public static countHostileNeighbours(roomName: string, myUsername: string | undefined): number {
        let count = 0;
        for (const neighbour of RoomUtils.getExits(roomName)) {
            const data = RoomUtils.findRoomData(neighbour);
            if (data?.owner && data.owner !== myUsername) count++;
        }
        return count;
    }

    /**
     * Rooms within SCOUT_DEPTH exit hops of the main room, plus anything already remembered,
     * excluding rooms the colony cannot reach.
     */
    public static getScoutableRooms(colony: ColonyManager): string[] {
        const mainRoom = colony.getMainRoom();
        if (!mainRoom) return [];

        const seen = new Set<string>([mainRoom.name]);
        let frontier = [mainRoom.name];
        for (let depth = 0; depth < SCOUT_DEPTH; depth++) {
            const next: string[] = [];
            for (const roomName of frontier) {
                for (const exit of RoomUtils.getExits(roomName)) {
                    if (seen.has(exit)) continue;
                    seen.add(exit);
                    next.push(exit);
                }
            }
            frontier = next;
        }
        for (const roomName of Object.keys(colony.colonyInfo.rooms)) {
            seen.add(roomName);
        }

        return Array.from(seen).filter(roomName => RoomUtils.isRoomReachable(mainRoom.name, roomName));
    }

    public static getRoomsNeedingScout(colony: ColonyManager): string[] {
        const mainRoomName = colony.getMainRoom()?.name;
        return RoomUtils.getScoutableRooms(colony).filter(roomName => {
            if (roomName === mainRoomName) return false;
            const data = colony.colonyInfo.rooms[roomName];
            if (!data) return true;
            if (data.isMain) return false;
            if (Game.rooms[roomName]) return false;
            return Game.time - RoomUtils.lastScoutTick(data) > RoomUtils.scoutInterval(data);
        });
    }

    /** Last tick the room was seen, or the last time a scout gave up on it. */
    public static lastScoutTick(data: RoomData): number {
        return Math.max(data.lastScouted || 0, data.lastScoutAttempt || 0);
    }

    public static scoutInterval(data: RoomData): number {
        return data.owner && (data.towerCount || 0) > 0 ? HOSTILE_SCOUT_INTERVAL : SCOUT_INTERVAL;
    }

    public static findBestRoomToScout(colony: ColonyManager): string | undefined {
        const roomsToScout = this.getRoomsNeedingScout(colony);
        if (roomsToScout.length === 0) return undefined;

        // Oldest intel first
        return roomsToScout.sort((a, b) => {
            const dataA = colony.colonyInfo.rooms[a];
            const dataB = colony.colonyInfo.rooms[b];
            return (dataA ? RoomUtils.lastScoutTick(dataA) : 0) - (dataB ? RoomUtils.lastScoutTick(dataB) : 0);
        })[0];
    }
}
