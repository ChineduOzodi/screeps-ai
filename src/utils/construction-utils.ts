
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

    public static buildExtensionCluster(centerPos: RoomPosition, room: Room): void {
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

        for (const offset of extensionOffsets) {
            const pos = new RoomPosition(centerPos.x + offset.x, centerPos.y + offset.y, roomName);
            pos.createConstructionSite(STRUCTURE_EXTENSION);
        }

        for (const offset of roadOffsets) {
            const pos = new RoomPosition(centerPos.x + offset.x, centerPos.y + offset.y, roomName);
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }

    public static buildRoadsAroundPosition(pos: RoomPosition): void {
        const roadPositions = [
            new RoomPosition(pos.x + 1, pos.y, pos.roomName),
            new RoomPosition(pos.x - 1, pos.y, pos.roomName),
            new RoomPosition(pos.x, pos.y + 1, pos.roomName),
            new RoomPosition(pos.x, pos.y - 1, pos.roomName),
            new RoomPosition(pos.x + 1, pos.y + 1, pos.roomName),
            new RoomPosition(pos.x - 1, pos.y - 1, pos.roomName),
            new RoomPosition(pos.x + 1, pos.y - 1, pos.roomName),
            new RoomPosition(pos.x - 1, pos.y + 1, pos.roomName),
        ];
        for (const roadPos of roadPositions) {
            roadPos.createConstructionSite(STRUCTURE_ROAD);
        }
    }

    public static buildRoadsToEnergySources(room: Room, spawnPos: RoomPosition): void {
        const sources = room.find(FIND_SOURCES);
        for (const source of sources) {
            ConstructionUtils.buildRoads(spawnPos, source.pos, 1);
        }
    }

    public static buildRoadsToController(room: Room, spawnPos: RoomPosition): void {
        const controller = room.controller;
        if (controller) {
            ConstructionUtils.buildRoads(spawnPos, controller.pos, 3);
        }
    }

    public static buildRoads(startPos: RoomPosition, endPos: RoomPosition, range: number): void {
        const path = startPos.findPathTo(endPos, {
            ignoreCreeps: true,
            ignoreDestructibleStructures: true,
            range,
            swampCost: 2,
        });

        for (const step of path) {
            const pos = new RoomPosition(step.x, step.y, startPos.roomName);
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }

    public static constructFirstContainer(spawn: StructureSpawn): void {
        const containerPos = new RoomPosition(spawn.pos.x + 2, spawn.pos.y, spawn.pos.roomName);
        spawn.room.createConstructionSite(containerPos, STRUCTURE_CONTAINER);
    }

     public static buildFirstTower(spawn: StructureSpawn): void {
        const towerPosition = new RoomPosition(spawn.pos.x + 2, spawn.pos.y + 2, spawn.pos.roomName);
        if (ConstructionUtils.isTileClearForStructure(towerPosition, spawn.room, true)) {
             towerPosition.createConstructionSite(STRUCTURE_TOWER);
             ConstructionUtils.buildRoadsAroundPosition(towerPosition);
        }
    }
}
