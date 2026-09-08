/**
 * Picks the rooms each colony should remote-mine. Pure so the energy system and the
 * room-intel overlay agree on the answer.
 *
 * A room qualifies when it is not the main room, has at least one source, is not owned,
 * is not reserved by someone else, has no more than a minor alert, and has a known
 * distance. Rooms are claimed globally: every colony's candidates are pooled and each
 * room goes to the closest colony that still has a free slot, so two colonies never
 * send miners to the same source. A colony has floor(RCL / 2) slots.
 */

/** What the assignment needs to know about one colony. */
export interface RemoteClaimant {
    rooms: { [roomName: string]: RoomData };
    rcl: number;
}

export interface RemoteAssignment {
    [colonyId: string]: string[];
}

/** Rooms assigned to one colony, closest first. */
export function selectRemoteRooms(
    colonyId: string,
    colonies: { [colonyId: string]: RemoteClaimant },
    myUsername: string | undefined,
): string[] {
    return assignRemoteRooms(colonies, myUsername)[colonyId] ?? [];
}

/**
 * Hands every candidate room to exactly one colony. Candidates are walked closest
 * first (ties broken by colony id, then room name, so the result is stable from tick
 * to tick); a room goes to the first colony that still has a slot.
 */
export function assignRemoteRooms(
    colonies: { [colonyId: string]: RemoteClaimant },
    myUsername: string | undefined,
): RemoteAssignment {
    const candidates: { colonyId: string; roomName: string; distance: number }[] = [];
    const slotsLeft: { [colonyId: string]: number } = {};
    const assignment: RemoteAssignment = {};

    for (const colonyId of Object.keys(colonies).sort()) {
        const colony = colonies[colonyId];
        assignment[colonyId] = [];
        slotsLeft[colonyId] = Math.floor((colony.rcl || 0) / 2);
        for (const roomName of rankRemoteRooms(colony.rooms, myUsername)) {
            candidates.push({ colonyId, roomName, distance: colony.rooms[roomName].distance || 0 });
        }
    }

    candidates.sort(
        (a, b) =>
            a.distance - b.distance || a.colonyId.localeCompare(b.colonyId) || a.roomName.localeCompare(b.roomName),
    );

    const claimed = new Set<string>();
    for (const c of candidates) {
        if (claimed.has(c.roomName) || slotsLeft[c.colonyId] <= 0) continue;
        claimed.add(c.roomName);
        slotsLeft[c.colonyId]--;
        assignment[c.colonyId].push(c.roomName);
    }
    return assignment;
}

/** The colony a room is assigned to, if any. */
export function remoteRoomOwner(roomName: string, assignment: RemoteAssignment): string | undefined {
    return Object.keys(assignment).find(id => assignment[id].includes(roomName));
}

/** Every room that qualifies for remote mining from one colony, closest first, without applying the slot cap. */
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

/**
 * Reads every colony from Memory as a claimant. `overrides` lets the caller substitute
 * live values (a colony's current RCL) for what Memory recorded last tick.
 */
export function remoteClaimantsFromMemory(overrides: { [colonyId: string]: Partial<RemoteClaimant> } = {}): {
    [colonyId: string]: RemoteClaimant;
} {
    const claimants: { [colonyId: string]: RemoteClaimant } = {};
    for (const id in Memory.colonies) {
        const colony = Memory.colonies[id];
        if (!colony || !colony.rooms || Array.isArray(colony.rooms)) continue;
        claimants[id] = { rooms: colony.rooms, rcl: colony.level || 0 };
    }
    // Overrides can introduce a colony Memory does not list yet (its first tick).
    for (const id in overrides) {
        const base: RemoteClaimant = claimants[id] ?? { rooms: {}, rcl: 0 };
        claimants[id] = { ...base, ...overrides[id] };
    }
    return claimants;
}
