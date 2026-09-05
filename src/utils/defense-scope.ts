/**
 * Which rooms a colony spends defenders on. Pure so the spawners, the defense system
 * and the room-intel overlay agree.
 *
 * A colony remembers many rooms it merely scouted, some with no sources and some split
 * by novice or respawn zone walls. Hostiles there are recorded but never answered: only
 * the main room, the rooms being mined and the room being claimed are worth a spawn.
 */
export function defendedRooms(colony: Colony): Set<string> {
    const rooms = new Set<string>([colony.id]);
    for (const source of colony.energyManagement?.sources ?? []) {
        if (source.position?.roomName) rooms.add(source.position.roomName);
    }
    const target = colony.expansionManagement?.expansionTarget;
    if (target) rooms.add(target);
    return rooms;
}

export function isDefendedRoom(colony: Colony, roomName: string): boolean {
    return defendedRooms(colony).has(roomName);
}

/** Rooms on alert that the colony will actually respond to. */
export function alertedDefendedRooms(colony: Colony): RoomData[] {
    const defended = defendedRooms(colony);
    return Object.keys(colony.rooms || {})
        .filter(name => defended.has(name) && (colony.rooms[name].alertLevel || 0) > 0)
        .map(name => colony.rooms[name]);
}
