/**
 * Reads a live room into the plain tile lists the base planners take as input, so the
 * planners themselves stay pure and unit-testable against synthetic terrain.
 */
import { RING, Tile } from "./room-grid";

export interface RoomSurvey {
    /** Tiles nothing can be built on and no creep can stand on. */
    obstacles: Tile[];
    /** Walkable tiles that must stay unbuilt: mining and upgrading spots, containers. */
    reserved: Tile[];
    /** Tiles that must keep creep access once the plan is built. */
    keepReachable: Tile[];
}

export function surveyRoom(room: Room): RoomSurvey {
    const obstacles: Tile[] = [];
    const reserved: Tile[] = [];
    const keepReachable: Tile[] = [];

    for (const structure of room.find(FIND_STRUCTURES)) {
        const type = structure.structureType;
        if (type === STRUCTURE_ROAD || type === STRUCTURE_RAMPART) continue;
        const tile = { x: structure.pos.x, y: structure.pos.y };
        // Containers are walkable but must keep their tile, so they only block building.
        if (type === STRUCTURE_CONTAINER) reserved.push(tile);
        else obstacles.push(tile);
    }
    for (const site of room.find(FIND_CONSTRUCTION_SITES)) {
        if (site.structureType === STRUCTURE_ROAD || site.structureType === STRUCTURE_RAMPART) continue;
        obstacles.push({ x: site.pos.x, y: site.pos.y });
    }

    // Keep the tiles creeps mine and upgrade from clear, and make sure we can get there.
    const workSites: RoomPosition[] = [
        ...room.find(FIND_SOURCES).map(s => s.pos),
        ...room.find(FIND_MINERALS).map(m => m.pos),
    ];
    if (room.controller) workSites.push(room.controller.pos);
    for (const pos of workSites) {
        // Creeps stand next to these, never on them.
        obstacles.push({ x: pos.x, y: pos.y });
        keepReachable.push({ x: pos.x, y: pos.y });
        for (const offset of RING) reserved.push({ x: pos.x + offset.x, y: pos.y + offset.y });
    }

    for (const exit of room.find(FIND_EXIT)) keepReachable.push({ x: exit.x, y: exit.y });

    return { obstacles, reserved, keepReachable };
}
