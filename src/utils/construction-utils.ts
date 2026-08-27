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

    public static getLinkStructures(
        room: Room,
        spawn: StructureSpawn,
        numLinks: number,
        sources: Source[],
        hubLink?: { x: number; y: number },
    ): ProjectStructure[] {
        const structures: ProjectStructure[] = [];
        if (numLinks <= 0) return structures;

        let placedLinks = 0;

        // 1. Storage/Spawn Link (Core Link). The core planner picks the tile; fall back to
        // the spawn's corner only when it has not run yet.
        const coreLinkPos = hubLink
            ? new RoomPosition(hubLink.x, hubLink.y, room.name)
            : new RoomPosition(spawn.pos.x + 1, spawn.pos.y + 1, room.name);

        // Ensure there isn't already a link near storage/spawn
        const hasCoreLink =
            room.find(FIND_MY_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_LINK && s.pos.inRangeTo(coreLinkPos, 2),
            }).length > 0 ||
            room.find(FIND_MY_CONSTRUCTION_SITES, {
                filter: s => s.structureType === STRUCTURE_LINK && s.pos.inRangeTo(coreLinkPos, 2),
            }).length > 0;

        if (!hasCoreLink && ConstructionUtils.isTileClearForStructure(coreLinkPos, room, true)) {
            structures.push({
                x: coreLinkPos.x,
                y: coreLinkPos.y,
                roomName: room.name,
                type: STRUCTURE_LINK,
            });
            placedLinks++;
        }

        if (placedLinks >= numLinks) return structures;

        // 2. Controller Link
        if (room.controller) {
            const hasControllerLink =
                room.find(FIND_MY_STRUCTURES, {
                    filter: s => s.structureType === STRUCTURE_LINK && s.pos.inRangeTo(room.controller!.pos, 2),
                }).length > 0 ||
                room.find(FIND_MY_CONSTRUCTION_SITES, {
                    filter: s => s.structureType === STRUCTURE_LINK && s.pos.inRangeTo(room.controller!.pos, 2),
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

            const hasSourceLink =
                room.find(FIND_MY_STRUCTURES, {
                    filter: s => s.structureType === STRUCTURE_LINK && s.pos.inRangeTo(source.pos, 2),
                }).length > 0 ||
                room.find(FIND_MY_CONSTRUCTION_SITES, {
                    filter: s => s.structureType === STRUCTURE_LINK && s.pos.inRangeTo(source.pos, 2),
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
