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

    public static findSuitableExtensionClusterPosition(spawn: StructureSpawn, room: Room): RoomPosition | null {
        const spawnPos = spawn.pos;
        const roomName = room.name;

        const extensionOffsets = [
            { x: 0, y: 0 },
            { x: 0, y: -1 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
            { x: 1, y: 0 },
        ];
        const roadOffsets = [
            { x: -1, y: -1 },
            { x: 1, y: -1 },
            { x: -1, y: 1 },
            { x: 1, y: 1 },
            { x: 0, y: -2 },
            { x: 0, y: 2 },
            { x: -2, y: 0 },
            { x: 2, y: 0 },
        ];

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

        const spotCandidates = [
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

        // Check primary spots
        for (const pDelta of spotCandidates) {
            const candidateCenter = new RoomPosition(spawnPos.x + pDelta.dx, spawnPos.y + pDelta.dy, roomName);
            if (isClusterValidAtCenter(candidateCenter)) {
                return candidateCenter;
            }
        }

        return null; // No suitable position found
    }

    public static getExtensionClusterStructures(centerPos: RoomPosition, room: Room): ProjectStructure[] {
        const roomName = room.name;
        const structures: ProjectStructure[] = [];
        const extensionOffsets = [
            { x: 0, y: 0 },
            { x: 0, y: -1 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
            { x: 1, y: 0 },
        ];
        const roadOffsets = [
            { x: -1, y: -1 },
            { x: 1, y: -1 },
            { x: -1, y: 1 },
            { x: 1, y: 1 },
            { x: 0, y: -2 },
            { x: 0, y: 2 },
            { x: -2, y: 0 },
            { x: 2, y: 0 },
        ];

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
        const path = startPos.findPathTo(endPos, {
            ignoreCreeps: true,
            ignoreDestructibleStructures: true,
            range,
            swampCost: 1, // Ignore swamp cost for planning optimal roads
        });

        return path.map(step => ({
            x: step.x,
            y: step.y,
            roomName: startPos.roomName,
            type: STRUCTURE_ROAD,
        }));
    }
}
