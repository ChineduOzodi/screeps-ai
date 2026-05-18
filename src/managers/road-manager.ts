import { ColonyManager } from "../prototypes/types";
import { ConstructionUtils } from "../utils/construction-utils";

export class RoadManager {
    private colony: ColonyManager;

    constructor(colony: ColonyManager) {
        this.colony = colony;
    }

    public planColonyRoads(): void {
        const mainRoom = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!mainRoom || !spawn) return;

        const roadPositions: RoomPosition[] = [];

        // Perimeter roads (around spawn)
        const spawnPerimeter = ConstructionUtils.getRoadsAroundPosition(spawn.pos);
        roadPositions.push(...spawnPerimeter.map(s => new RoomPosition(s.x, s.y, s.roomName)));

        // Roads to Colony Sources (Main + Remotes)
        const energyManagement = this.colony.colonyInfo.energyManagement;
        if (energyManagement && energyManagement.sources) {
            for (const sourceInfo of energyManagement.sources) {
                // Use the calculated mining position if available, otherwise source pos
                const targetPos = sourceInfo.miningPosition
                    ? new RoomPosition(
                          sourceInfo.miningPosition.x,
                          sourceInfo.miningPosition.y,
                          sourceInfo.miningPosition.roomName,
                      )
                    : new RoomPosition(sourceInfo.position.x, sourceInfo.position.y, sourceInfo.position.roomName);

                const path = ConstructionUtils.calculateRoads(spawn.pos, targetPos, 0, roadPositions);
                roadPositions.push(...path.map(s => new RoomPosition(s.x, s.y, s.roomName)));
            }
        }

        // Roads to Controllers in all colony rooms (where we have vision)
        for (const roomName in this.colony.colonyInfo.rooms) {
            const room = Game.rooms[roomName];
            if (room && room.controller) {
                const path = ConstructionUtils.calculateRoads(spawn.pos, room.controller.pos, 3, roadPositions);
                roadPositions.push(...path.map(s => new RoomPosition(s.x, s.y, s.roomName)));
            }
        }

        // Filter duplicates and invalid positions
        const uniquePositions = this.getUniquePositions(roadPositions);

        // Place roads
        for (const pos of uniquePositions) {
            this.buildRoadAt(pos);
        }

        // Update stats immediately after planning
        this.updateRoadStats();
    }

    private getUniquePositions(positions: RoomPosition[]): RoomPosition[] {
        const seen = new Set<string>();
        const unique: RoomPosition[] = [];
        for (const pos of positions) {
            const key = `${pos.roomName}:${pos.x},${pos.y}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(pos);
            }
        }
        return unique;
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

        // Check global construction site limit
        if (Object.keys(Game.constructionSites).length >= 100) return;

        // Check if tile is blocked by something other than a road/container
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

        for (const roomName in this.colony.colonyInfo.rooms) {
            const roomData = this.colony.colonyInfo.rooms[roomName];
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
