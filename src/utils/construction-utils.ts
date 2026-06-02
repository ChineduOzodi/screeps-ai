import { PathfindingCache } from "./pathfinding-cache";
import { Logger } from "./logger";

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
                Logger.error(`Failed to create candidate for extension: ${x},${y} in ${roomName}`);
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

    public static getFirstStorageStructures(spawn: StructureSpawn): ProjectStructure[] {
        return [
            {
                x: spawn.pos.x + 2,
                y: spawn.pos.y,
                roomName: spawn.pos.roomName,
                type: STRUCTURE_STORAGE,
            },
        ];
    }

    public static getFirstTerminalStructures(spawn: StructureSpawn): ProjectStructure[] {
        return [
            {
                x: spawn.pos.x - 2,
                y: spawn.pos.y,
                roomName: spawn.pos.roomName,
                type: STRUCTURE_TERMINAL,
            },
        ];
    }

    public static getLinkStructures(room: Room, spawn: StructureSpawn, numLinks: number, sources: Source[]): ProjectStructure[] {
        const structures: ProjectStructure[] = [];
        if (numLinks <= 0) return structures;

        let placedLinks = 0;

        // 1. Storage/Spawn Link (Core Link)
        const coreLinkPos = new RoomPosition(spawn.pos.x + 1, spawn.pos.y + 1, room.name);
        const storage = room.storage;

        // Ensure there isn't already a link near storage/spawn
        const hasCoreLink = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_LINK && s.pos.inRangeTo(coreLinkPos, 2)
        }).length > 0 || room.find(FIND_MY_CONSTRUCTION_SITES, {
            filter: s => s.structureType === STRUCTURE_LINK && s.pos.inRangeTo(coreLinkPos, 2)
        }).length > 0;

        if (!hasCoreLink && ConstructionUtils.isTileClearForStructure(coreLinkPos, room, true)) {
            structures.push({
                x: coreLinkPos.x,
                y: coreLinkPos.y,
                roomName: room.name,
                type: STRUCTURE_LINK
            });
            placedLinks++;
        }

        if (placedLinks >= numLinks) return structures;

        // 2. Controller Link
        if (room.controller) {
            const hasControllerLink = room.find(FIND_MY_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_LINK && s.pos.inRangeTo(room.controller!.pos, 2)
            }).length > 0 || room.find(FIND_MY_CONSTRUCTION_SITES, {
                filter: s => s.structureType === STRUCTURE_LINK && s.pos.inRangeTo(room.controller!.pos, 2)
            }).length > 0;

            if (!hasControllerLink) {
                // Find a spot near controller
                for (let dx = -2; dx <= 2; dx++) {
                    for (let dy = -2; dy <= 2; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const pos = new RoomPosition(room.controller.pos.x + dx, room.controller.pos.y + dy, room.name);
                        if (ConstructionUtils.isTileClearForStructure(pos, room, true)) {
                            structures.push({ x: pos.x, y: pos.y, roomName: room.name, type: STRUCTURE_LINK });
                            placedLinks++;
                            break;
                        }
                    }
                    if (placedLinks >= numLinks || !hasControllerLink) break; // found a spot
                }
            }
        }

        if (placedLinks >= numLinks) return structures;

        // 3. Source Links
        for (const source of sources) {
            if (placedLinks >= numLinks) break;

            const hasSourceLink = room.find(FIND_MY_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_LINK && s.pos.inRangeTo(source.pos, 2)
            }).length > 0 || room.find(FIND_MY_CONSTRUCTION_SITES, {
                filter: s => s.structureType === STRUCTURE_LINK && s.pos.inRangeTo(source.pos, 2)
            }).length > 0;

            if (!hasSourceLink) {
                for (let dx = -2; dx <= 2; dx++) {
                    for (let dy = -2; dy <= 2; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const pos = new RoomPosition(source.pos.x + dx, source.pos.y + dy, room.name);
                        if (ConstructionUtils.isTileClearForStructure(pos, room, true)) {
                            structures.push({ x: pos.x, y: pos.y, roomName: room.name, type: STRUCTURE_LINK });
                            placedLinks++;
                            break;
                        }
                    }
                    if (placedLinks >= numLinks || !hasSourceLink) break; // found a spot
                }
            }
        }

        return structures;
    }

    public static getTowerStructures(spawn: StructureSpawn, numTowers: number): ProjectStructure[] {
        const structures: ProjectStructure[] = [];
        const candidates = [
            { x: 2, y: 2 },
            { x: -2, y: -2 },
            { x: -2, y: 2 },
            { x: 2, y: -2 },
            { x: 0, y: 3 },
            { x: 0, y: -3 },
        ];

        for (const candidate of candidates) {
            // Count already planned or placed towers to avoid overbuilding
            const towerPosition = new RoomPosition(spawn.pos.x + candidate.x, spawn.pos.y + candidate.y, spawn.pos.roomName);
            if (ConstructionUtils.isTileClearForStructure(towerPosition, spawn.room, true)) {
                structures.push({
                    x: towerPosition.x,
                    y: towerPosition.y,
                    roomName: spawn.pos.roomName,
                    type: STRUCTURE_TOWER,
                });
                structures.push(...ConstructionUtils.getRoadsAroundPosition(towerPosition));

                // If we've found enough spots to place the required missing towers, break
                if (structures.filter(s => s.type === STRUCTURE_TOWER).length >= numTowers) {
                    break;
                }
            }
        }
        return structures;
    }

    public static calculateRoads(
        startPos: RoomPosition,
        endPos: RoomPosition,
        range: number,
        plannedRoads: RoomPosition[] = [],
    ): ProjectStructure[] {
        const result = PathFinder.search(
            startPos,
            { pos: endPos, range },
            {
                plainCost: 3,
                swampCost: 15,
                roomCallback: (roomName: string) => {
                    const room = Game.rooms[roomName];
                    const costs = new PathFinder.CostMatrix();

                    if (room) {
                        // Favor existing roads
                        const roads = room.find(FIND_STRUCTURES, {
                            filter: s => s.structureType === STRUCTURE_ROAD,
                        });
                        for (const road of roads) {
                            costs.set(road.pos.x, road.pos.y, 1);
                        }

                        // Favor road construction sites
                        const sites = room.find(FIND_CONSTRUCTION_SITES, {
                            filter: s => s.structureType === STRUCTURE_ROAD,
                        });
                        for (const site of sites) {
                            costs.set(site.pos.x, site.pos.y, 1);
                        }

                        // Avoid obstacles
                        room.find(FIND_STRUCTURES).forEach(s => {
                            if (
                                s.structureType !== STRUCTURE_ROAD &&
                                s.structureType !== STRUCTURE_CONTAINER &&
                                (s.structureType !== STRUCTURE_RAMPART || !(s as StructureRampart).my)
                            ) {
                                costs.set(s.pos.x, s.pos.y, 0xff);
                            }
                        });
                    }

                    // Apply planned roads costs (even if room is not visible!)
                    for (const plannedRoad of plannedRoads) {
                        if (plannedRoad.roomName === roomName) {
                            costs.set(plannedRoad.x, plannedRoad.y, 1);
                        }
                    }

                    return costs;
                },
            },
        );

        return result.path.map(pos => ({
            x: pos.x,
            y: pos.y,
            roomName: pos.roomName,
            type: STRUCTURE_ROAD,
        }));
    }
}
