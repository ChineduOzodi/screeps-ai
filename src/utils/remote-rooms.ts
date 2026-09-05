/**
 * Picks the rooms a colony should remote-mine. Pure so the energy system and the
 * room-intel overlay agree on the answer.
 *
 * A room qualifies when it is not the main room, has at least one source, is not owned,
 * is not reserved by someone else, has no more than a minor alert, and has a known
 * distance. The closest rooms win, up to floor(RCL / 2) slots.
 */
export function selectRemoteRooms(
    rooms: { [roomName: string]: RoomData },
    rcl: number,
    myUsername: string | undefined,
): string[] {
    return rankRemoteRooms(rooms, myUsername).slice(0, Math.floor(rcl / 2));
}

/** Every room that qualifies for remote mining, closest first, without applying the slot cap. */
export function rankRemoteRooms(rooms: { [roomName: string]: RoomData }, myUsername: string | undefined): string[] {
    return Object.keys(rooms)
        .filter(name => isRemoteMiningCandidate(rooms[name], myUsername))
        .sort((a, b) => (rooms[a].distance || 0) - (rooms[b].distance || 0));
}

export function isRemoteMiningCandidate(data: RoomData, myUsername: string | undefined): boolean {
    if (data.isMain) return false;
    if (data.alertLevel > 1) return false;
    if (!data.distance) return false;
    if ((data.sourceCount || 0) < 1) return false;
    if (data.owner) return false;
    if (data.reservation && data.reservation !== myUsername) return false;
    return true;
}
