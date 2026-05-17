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
        const moveTimePath = PathfindingCache.findPath(creep.pos, target, {
            range,
        });
        const moveTime = moveTimePath.length;

        if (!creep.ticksToLive || (moveTime >= creep.ticksToLive && !workDuration)) {
            workDuration = 1;
        } else if (!workDuration) {
            workDuration = creep.ticksToLive - moveTime;
        }
        const startTime = Game.time + moveTime;
        const endTime = Game.time + moveTime + workDuration;

        const path = PathfindingCache.findPath(creep.pos, target, {
            range,
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

        return { path, startTime, endTime };
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
        if (!Memory.rooms[roomName]) {
            // We can't setup if room memory doesn't exist, but usually it should if we are here
            return;
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
