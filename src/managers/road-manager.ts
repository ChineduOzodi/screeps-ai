import { ColonyManager } from "../prototypes/types";
import { ConstructionUtils } from "../utils/construction-utils";

export class RoadManager {
    private colony: ColonyManager;

    constructor(colony: ColonyManager) {
        this.colony = colony;
    }

    public planColonyRoads(): void {
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn) return;

        const roadPositions: RoomPosition[] = [];

        // Perimeter roads (around spawn)
        const spawnPerimeter = ConstructionUtils.getRoadsAroundPosition(spawn.pos);
        roadPositions.push(...spawnPerimeter.map(s => new RoomPosition(s.x, s.y, s.roomName)));

        // Roads to Sources
        const sources = room.find(FIND_SOURCES);
        for (const source of sources) {
            const path = ConstructionUtils.calculateRoads(spawn.pos, source.pos, 1);
            roadPositions.push(...path.map(s => new RoomPosition(s.x, s.y, s.roomName)));
        }

        // Roads to Controller
        if (room.controller) {
            const path = ConstructionUtils.calculateRoads(spawn.pos, room.controller.pos, 3);
            roadPositions.push(...path.map(s => new RoomPosition(s.x, s.y, s.roomName)));
        }

        // Place roads
        for (const pos of roadPositions) {
            this.buildRoadAt(pos);
        }

        // Update stats immediately after planning
        this.updateRoadStats();
    }

    private buildRoadAt(pos: RoomPosition): void {
        const room = Game.rooms[pos.roomName];
        if (!room) return;

        // Check for existing road
        const structures = pos.lookFor(LOOK_STRUCTURES);
        if (structures.some(s => s.structureType === STRUCTURE_ROAD)) return;

        // Check for existing construction site
        const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
        if (sites.some(s => s.structureType === STRUCTURE_ROAD)) return;

        // Check if tile is blocked by something other than a road/container
        // (Simplified check: just try to create the site and see if it fails?)
        // Better to use the utility
        if (!ConstructionUtils.isTileClearForStructure(pos, room, true)) return;

        room.createConstructionSite(pos, STRUCTURE_ROAD);
    }

    public updateRoadStats(): void {
        const info = this.colony.colonyInfo.infrastructureManagement;
        if (!info) return;

        if (info.lastRoadMaintenanceCheck && Game.time - info.lastRoadMaintenanceCheck < 100) {
            return;
        }

        let totalRoads = 0;
        let totalCost = 0;

        for (const roomData of this.colony.colonyInfo.rooms) {
            const room = Game.rooms[roomData.name];
            if (!room) continue;

            const roads = room.find(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_ROAD,
            }) as StructureRoad[];

            totalRoads += roads.length;

            if (typeof room.getTerrain !== "function") continue;

            const terrain = room.getTerrain();
            for (const road of roads) {
                const t = terrain.get(road.pos.x, road.pos.y);
                if (t === TERRAIN_MASK_SWAMP) {
                    totalCost += 5;
                } else if (t === TERRAIN_MASK_WALL) {
                    totalCost += 150;
                } else {
                    totalCost += 1;
                }
            }
        }

        info.roadCount = totalRoads;
        info.roadMaintenanceCost = totalCost;
        info.lastRoadMaintenanceCheck = Game.time;
    }

    public areColonyRoadsBuilt(): boolean {
        // Since we don't track projects anymore, we consider it "built" if we've run the planner
        // and there are no road construction sites in our main rooms.
        // This is a bit of a heuristic.
        const mainRoom = this.colony.getMainRoom();
        if (!mainRoom) return true;

        const sites = mainRoom.find(FIND_CONSTRUCTION_SITES, {
            filter: s => s.structureType === STRUCTURE_ROAD,
        });

        return sites.length === 0;
    }
}
