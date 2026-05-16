import { PathfindingCache } from "./pathfinding-cache";

export class ConstructionUtils {
    public static isTileClearForStructure(pos: RoomPosition, room: Room, ignoreRoads: boolean = false): boolean {
        if (pos.x < 1 || pos.x > 48 || pos.y < 1 || pos.y > 48) {
            return false;
        }
        const terrain = room.getTerrain();
        if (terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL) {
            return false;
        }

        const existingStructures = room
            .lookForAt(LOOK_STRUCTURES, pos)
            .filter(structure => structure.structureType !== STRUCTURE_ROAD || !ignoreRoads);
        if (existingStructures.length > 0) {
            return false;
        }

        const existingConstructionSites = room
            .lookForAt(LOOK_CONSTRUCTION_SITES, pos)
            .filter(site => site.structureType !== STRUCTURE_ROAD || !ignoreRoads);
        if (existingConstructionSites.length > 0) {
            return false;
        }

        return true;
    }

    public static getExtensionClusterCandidates(): { dx: number; dy: number }[] {
        return [
            { dx: 0, dy: -4 },
            { dx: -2, dy: -6 },
            { dx: 2, dy: -6 },
            { dx: 0, dy: -8 },
            { dx: -4, dy: 0 },
            { dx: -6, dy: -2 },
            { dx: -6, dy: 2 },
            { dx: -8, dy: 0 },
            { dx: 0, dy: 4 },
            { dx: -2, dy: 6 },
            { dx: 2, dy: 6 },
            { dx: 0, dy: 8 },
        ];
    }

    public static getExtensionClusterOffsets(): { x: number; y: number }[] {
        return [
            { x: 0, y: 0 },
            { x: 0, y: -1 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
            { x: 1, y: 0 },
        ];
    }

    public static getExtensionRoadOffsets(): { x: number; y: number }[] {
        return [
            { x: -1, y: -1 },
            { x: 1, y: -1 },
            { x: -1, y: 1 },
            { x: 1, y: 1 },
            { x: 0, y: -2 },
            { x: 0, y: 2 },
            { x: -2, y: 0 },
            { x: 2, y: 0 },
        ];
    }

    public static findSuitableExtensionClusterPosition(spawn: StructureSpawn, room: Room): RoomPosition | null {
        const spawnPos = spawn.pos;
        const roomName = room.name;

        const extensionOffsets = ConstructionUtils.getExtensionClusterOffsets();
        const roadOffsets = ConstructionUtils.getExtensionRoadOffsets();

        const isClusterValidAtCenter = (center: RoomPosition): boolean => {
            for (const offset of extensionOffsets) {
                const extPos = new RoomPosition(center.x + offset.x, center.y + offset.y, roomName);
                if (!ConstructionUtils.isTileClearForStructure(extPos, room)) return false;
            }
            for (const offset of roadOffsets) {
                const roadPos = new RoomPosition(center.x + offset.x, center.y + offset.y, roomName);
                if (!ConstructionUtils.isTileClearForStructure(roadPos, room, true)) return false;
            }
            return true;
        };

        const spotCandidates = ConstructionUtils.getExtensionClusterCandidates();

        // Check primary spots
        for (const pDelta of spotCandidates) {
            const x = spawnPos.x + pDelta.dx;
            const y = spawnPos.y + pDelta.dy;
            if (x < 0 || x > 49 || y < 0 || y > 49) continue;
            try {
                const candidateCenter = new RoomPosition(x, y, roomName);
                if (isClusterValidAtCenter(candidateCenter)) {
                    return candidateCenter;
                }
            } catch (e) {
                console.log(`Failed to create candidate for extension: ${x},${y} in ${roomName}`);
            }
        }

        return null; // No suitable position found
    }

    public static getExtensionClusterStructures(centerPos: RoomPosition, room: Room): ProjectStructure[] {
        const roomName = room.name;
        const structures: ProjectStructure[] = [];
        const extensionOffsets = ConstructionUtils.getExtensionClusterOffsets();
        const roadOffsets = ConstructionUtils.getExtensionRoadOffsets();

        for (const offset of extensionOffsets) {
            structures.push({
                x: centerPos.x + offset.x,
                y: centerPos.y + offset.y,
                roomName,
                type: STRUCTURE_EXTENSION,
            });
        }

        for (const offset of roadOffsets) {
            structures.push({
                x: centerPos.x + offset.x,
                y: centerPos.y + offset.y,
                roomName,
                type: STRUCTURE_ROAD,
            });
        }
        return structures;
    }

    public static getRoadsAroundPosition(pos: RoomPosition): ProjectStructure[] {
        const roadPositions = [
            { x: pos.x + 1, y: pos.y },
            { x: pos.x - 1, y: pos.y },
            { x: pos.x, y: pos.y + 1 },
            { x: pos.x, y: pos.y - 1 },
            { x: pos.x + 1, y: pos.y + 1 },
            { x: pos.x - 1, y: pos.y - 1 },
            { x: pos.x + 1, y: pos.y - 1 },
            { x: pos.x - 1, y: pos.y + 1 },
        ];
        return roadPositions.map(p => ({
            x: p.x,
            y: p.y,
            roomName: pos.roomName,
            type: STRUCTURE_ROAD,
        }));
    }

    public static getFirstContainerStructures(spawn: StructureSpawn): ProjectStructure[] {
        return [
            {
                x: spawn.pos.x + 2,
                y: spawn.pos.y,
                roomName: spawn.pos.roomName,
                type: STRUCTURE_CONTAINER,
            },
        ];
    }

    public static getFirstTowerStructures(spawn: StructureSpawn): ProjectStructure[] {
        const towerPosition = new RoomPosition(spawn.pos.x + 2, spawn.pos.y + 2, spawn.pos.roomName);
        if (ConstructionUtils.isTileClearForStructure(towerPosition, spawn.room, true)) {
            const structures: ProjectStructure[] = [];
            structures.push({
                x: towerPosition.x,
                y: towerPosition.y,
                roomName: spawn.pos.roomName,
                type: STRUCTURE_TOWER,
            });
            return structures.concat(ConstructionUtils.getRoadsAroundPosition(towerPosition));
        }
        return [];
    }

    public static calculateRoads(startPos: RoomPosition, endPos: RoomPosition, range: number): ProjectStructure[] {
        const path = PathfindingCache.findPath(startPos, endPos, {
            ignoreCreeps: true,
            ignoreDestructibleStructures: true,
            range,
            plainCost: 10,
            swampCost: 50,
            // @ts-ignore
            favorExistingRoads: true,
            costCallback: (roomName, costMatrix) => {
                const room = Game.rooms[roomName];
                if (!room) return undefined;

                const roads = room.find(FIND_STRUCTURES, {
                    filter: s => s.structureType === STRUCTURE_ROAD,
                });
                for (const road of roads) {
                    costMatrix.set(road.pos.x, road.pos.y, 1);
                }

                const sites = room.find(FIND_CONSTRUCTION_SITES, {
                    filter: s => s.structureType === STRUCTURE_ROAD,
                });
                for (const site of sites) {
                    costMatrix.set(site.pos.x, site.pos.y, 1);
                }
                return costMatrix;
            },
        });

        return path.map(step => ({
            x: step.x,
            y: step.y,
            roomName: startPos.roomName,
            type: STRUCTURE_ROAD,
        }));
    }
}
