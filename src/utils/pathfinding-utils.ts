import { PathfindingCache } from "./pathfinding-cache";

export class PathfindingUtils {
    public static findPathWithReservation(
        creep: Creep,
        target: RoomPosition | _HasRoomPosition,
        range: number,
        workDuration: number,
        ignoreRoles?: string[],
    ): {
        path: RoomPosition[];
        startTime: number;
        endTime: number;
    } {
        const targetPos = (target as any).pos || (target as RoomPosition);
        let effectiveRange = range;

        // If target is in a different room, force range 0 to ensure we enter the room.
        // Screeps actions like build() fail across room boundaries even if in range.
        if (creep.pos.roomName !== targetPos.roomName) {
            effectiveRange = 0;
        }

        // A cheap travel estimate sizes the reservation window for the search; the real
        // path length replaces it afterwards. Searching twice just to learn the length
        // doubled the cost of every path request.
        const estimate = PathfindingUtils.estimateTravelTicks(creep.pos, targetPos);
        let { startTime, endTime } = PathfindingUtils.reservationWindow(creep, estimate, workDuration);

        const path = PathfindingCache.findPath(creep.pos, target, {
            range: effectiveRange,
            roomCallback(roomName: string) {
                const roomMemory = Memory.rooms[roomName];
                const costs = PathfindingCache.getStandardCostMatrix(roomName);

                if (roomMemory && roomMemory.positionReservations) {
                    const keys = Object.keys(roomMemory.positionReservations);

                    for (const key of keys) {
                        const reservation = roomMemory.positionReservations[key];

                        if (reservation.reservations) {
                            if (
                                !PathfindingUtils.checkReservationAvailable(
                                    roomName,
                                    reservation.pos,
                                    startTime,
                                    endTime,
                                    ignoreRoles,
                                    creep.name,
                                )
                            ) {
                                // Set high cost but NOT 0xff, so we can path through each other if needed
                                // but will prefer a free path.
                                costs.set(reservation.pos.x, reservation.pos.y, 20);
                            }
                        }
                    }
                }

                return costs;
            },
        } as any);

        if (path.length > 0) {
            ({ startTime, endTime } = PathfindingUtils.reservationWindow(creep, path.length, workDuration));
        }
        return { path, startTime, endTime };
    }

    /** Ticks to reach a position without pathing: range in-room, room hops across rooms. */
    public static estimateTravelTicks(from: RoomPosition, to: RoomPosition): number {
        if (from.roomName === to.roomName) return from.getRangeTo(to);
        const rooms =
            typeof Game.map?.getRoomLinearDistance === "function"
                ? Game.map.getRoomLinearDistance(from.roomName, to.roomName)
                : 1;
        return rooms * 50 + 25;
    }

    private static reservationWindow(
        creep: Creep,
        moveTime: number,
        workDuration: number,
    ): { startTime: number; endTime: number } {
        let duration = workDuration;
        if (!creep.ticksToLive || (moveTime >= creep.ticksToLive && !duration)) {
            duration = 1;
        } else if (!duration) {
            duration = creep.ticksToLive - moveTime;
        }
        return { startTime: Game.time + moveTime, endTime: Game.time + moveTime + duration };
    }

    public static checkReservationAvailable(
        roomName: string,
        pos: RoomPosition | PathStep,
        startTime: number,
        endTime?: number,
        ignoreRoles?: string[],
        excludeCreepName?: string,
    ): boolean {
        this.checkRoomReservationSetup(roomName, pos);
        const roomMemory = Memory.rooms[roomName];
        for (const reservation of roomMemory.positionReservations[`${pos.x},${pos.y}`].reservations) {
            if (excludeCreepName && reservation.creepName === excludeCreepName) {
                continue;
            }
            if (startTime <= reservation.endTime && (!ignoreRoles || !ignoreRoles.includes(reservation.role))) {
                return false;
            }
            if (
                endTime &&
                reservation.startTime <= endTime &&
                (!ignoreRoles || !ignoreRoles.includes(reservation.role))
            ) {
                return false;
            }
        }
        return true;
    }

    public static reserveLocation(
        creep: Creep,
        pos: RoomPosition | PathStep,
        startTime: number,
        endTime: number,
    ): void {
        this.unreserveAll(creep);

        const roomName = (pos as RoomPosition).roomName || creep.room.name;
        this.checkRoomReservationSetup(roomName, pos);
        this.deletePastReservations(roomName, pos);

        const roomMemory = Memory.rooms[roomName];
        const posKey = `${pos.x},${pos.y}`;

        for (let i = roomMemory.positionReservations[posKey].reservations.length - 1; i >= 0; i--) {
            const reservation = roomMemory.positionReservations[posKey].reservations[i];
            if (reservation.endTime > startTime) {
                reservation.endTime = startTime;
            }
        }

        roomMemory.positionReservations[posKey].reservations.push({
            creepName: creep.name,
            startTime,
            endTime,
            role: creep.memory.role,
        });

        if (creep.memory.movementSystem) {
            creep.memory.movementSystem.reservedRoomName = roomName;
            creep.memory.movementSystem.reservedPos = { x: pos.x, y: pos.y };
        }
    }

    public static checkRoomReservationSetup(roomName: string, pos?: RoomPosition | PathStep): void {
        if (!Memory.rooms) {
            Memory.rooms = {};
        }
        if (!Memory.rooms[roomName]) {
            // The engine only creates room memory for rooms we can see. A creep heading into an
            // unseen room (a scout, a claimer) still reserves its destination there, so create
            // the entry ourselves. cleanupRoomMemory drops it again once the creep is done.
            Memory.rooms[roomName] = { positionReservations: {} } as RoomMemory;
        }
        if (!Memory.rooms[roomName].positionReservations) {
            Memory.rooms[roomName].positionReservations = {};
        }
        if (pos && !Memory.rooms[roomName].positionReservations[`${pos.x},${pos.y}`]) {
            Memory.rooms[roomName].positionReservations[`${pos.x},${pos.y}`] = {
                pos: { x: pos.x, y: pos.y } as any, // Store simple object to avoid serialization issues
                reservations: [],
            };
        }
    }

    public static unreservePosition(creep: Creep, room: Room, pos: RoomPosition | PathStep): void {
        const roomName = room.name;
        this.checkRoomReservationSetup(roomName, pos);
        const roomMemory = Memory.rooms[roomName];
        if (!roomMemory || !roomMemory.positionReservations) return;

        const posKey = `${pos.x},${pos.y}`;
        const entry = roomMemory.positionReservations[posKey];
        if (!entry) return;

        for (let i = entry.reservations.length - 1; i >= 0; i--) {
            const reservation = entry.reservations[i];
            if (reservation.creepName === creep.name) {
                entry.reservations.splice(i, 1);
            }
        }

        if (entry.reservations.length === 0) {
            delete roomMemory.positionReservations[posKey];
        }

        if (creep.memory.movementSystem) {
            delete creep.memory.movementSystem.reservationStartTime;
            delete creep.memory.movementSystem.reservationEndTime;
            delete creep.memory.movementSystem.reservedRoomName;
            delete creep.memory.movementSystem.reservedPos;
        }
    }

    public static unreservePositions(roomName: string, pos: RoomPosition | PathStep): void {
        this.checkRoomReservationSetup(roomName, pos);
        const roomMemory = Memory.rooms[roomName];
        if (!roomMemory || !roomMemory.positionReservations) return;

        const posKey = `${pos.x},${pos.y}`;
        const entry = roomMemory.positionReservations[posKey];
        if (!entry) return;

        for (let i = entry.reservations.length - 1; i >= 0; i--) {
            const reservation = entry.reservations[i];
            const creepAlive = Game.creeps[reservation.creepName];
            if (reservation.endTime < Game.time || !creepAlive) {
                entry.reservations.splice(i, 1);
            }
        }

        if (entry.reservations.length === 0) {
            delete roomMemory.positionReservations[posKey];
        }
    }

    public static deletePastReservations(roomName: string, pos: RoomPosition | PathStep): void {
        this.checkRoomReservationSetup(roomName, pos);
        const roomMemory = Memory.rooms[roomName];
        if (!roomMemory || !roomMemory.positionReservations) return;

        const posKey = `${pos.x},${pos.y}`;
        const entry = roomMemory.positionReservations[posKey];
        if (!entry) return;

        for (let i = entry.reservations.length - 1; i >= 0; i--) {
            const reservation = entry.reservations[i];
            const creepAlive = Game.creeps[reservation.creepName];
            if (reservation.endTime < Game.time || !creepAlive) {
                entry.reservations.splice(i, 1);
            }
        }
    }

    public static unreserveAll(creep: Creep): void {
        // Use tracked reservation if available
        if (creep.memory.movementSystem?.reservedRoomName && creep.memory.movementSystem.reservedPos) {
            const roomName = creep.memory.movementSystem.reservedRoomName;
            const pos = creep.memory.movementSystem.reservedPos;
            const roomMemory = Memory.rooms[roomName];

            if (roomMemory && roomMemory.positionReservations) {
                const posKey = `${pos.x},${pos.y}`;
                const entry = roomMemory.positionReservations[posKey];
                if (entry) {
                    for (let i = entry.reservations.length - 1; i >= 0; i--) {
                        if (entry.reservations[i].creepName === creep.name) {
                            entry.reservations.splice(i, 1);
                        }
                    }
                    if (entry.reservations.length === 0) {
                        delete roomMemory.positionReservations[posKey];
                    }
                }
            }
        }

        // Fallback: scan current room for legacy or missed reservations
        const currentRoomMemory = Memory.rooms[creep.room.name];
        if (currentRoomMemory && currentRoomMemory.positionReservations) {
            const keys = Object.keys(currentRoomMemory.positionReservations);
            for (const key of keys) {
                const entry = currentRoomMemory.positionReservations[key];
                for (let i = entry.reservations.length - 1; i >= 0; i--) {
                    // Check both creepName (new) and creepId (legacy)
                    if (
                        entry.reservations[i].creepName === creep.name ||
                        (entry.reservations[i] as any).creepId === creep.id
                    ) {
                        entry.reservations.splice(i, 1);
                    }
                }
                if (entry.reservations.length === 0) {
                    delete currentRoomMemory.positionReservations[key];
                }
            }
        }

        if (creep.memory.movementSystem) {
            delete creep.memory.movementSystem.reservationStartTime;
            delete creep.memory.movementSystem.reservationEndTime;
            delete creep.memory.movementSystem.reservedRoomName;
            delete creep.memory.movementSystem.reservedPos;
        }
    }
}
