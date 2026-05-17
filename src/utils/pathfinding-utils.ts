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
                const room = Game.rooms[roomName];
                if (!room) return new PathFinder.CostMatrix();

                const costs = new PathFinder.CostMatrix();

                // Add roads from Cache's default or explicitly here?
                // For now, let's just handle reservations
                PathfindingUtils.checkRoomReservationSetup(room);

                if (room.memory.positionReservations) {
                    const keys = Object.keys(room.memory.positionReservations);

                    for (const key of keys) {
                        const reservation = room.memory.positionReservations[key];

                        if (reservation.reservations) {
                            if (
                                !PathfindingUtils.checkReservationAvailable(
                                    room,
                                    reservation.pos,
                                    startTime,
                                    endTime,
                                    ignoreRoles,
                                    creep.id,
                                )
                            ) {
                                costs.set(reservation.pos.x, reservation.pos.y, 0xff);
                            }
                        }
                    }
                }

                // Also add standard obstacles to CostMatrix
                room.find(FIND_STRUCTURES).forEach(s => {
                    if (s.structureType === STRUCTURE_ROAD) {
                        costs.set(s.pos.x, s.pos.y, 1);
                    } else if (
                        s.structureType !== STRUCTURE_CONTAINER &&
                        (s.structureType !== STRUCTURE_RAMPART || !(s as StructureRampart).my)
                    ) {
                        costs.set(s.pos.x, s.pos.y, 0xff);
                    }
                });

                return costs;
            },
        } as any);

        return { path, startTime, endTime };
    }

    public static checkReservationAvailable(
        room: Room,
        pos: RoomPosition | PathStep,
        startTime: number,
        endTime?: number,
        ignoreRoles?: string[],
        excludeCreepId?: string,
    ): boolean {
        this.checkRoomReservationSetup(room, pos);
        for (const reservation of room.memory.positionReservations[`${pos.x},${pos.y}`].reservations) {
            if (excludeCreepId && reservation.creepId === excludeCreepId) {
                continue;
            }
            if (startTime <= reservation.endTime && (!ignoreRoles || !(reservation.role in ignoreRoles))) {
                // console.log(`${pos.x},${pos.y} reservation check: arriving too soon (${startTime} <= ${reservation.endTime})`);
                return false;
            }
            if (endTime && reservation.startTime <= endTime && (!ignoreRoles || !(reservation.role in ignoreRoles))) {
                // console.log(`${pos.x},${pos.y} reservation check: endint too late (${endTime} >= ${reservation.startTime})`);
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
        const { room } = creep;
        this.checkRoomReservationSetup(room, pos);
        this.deletePastReservations(room, pos);
        for (let i = room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.length - 1; i >= 0; i--) {
            const reservation = room.memory.positionReservations[`${pos.x},${pos.y}`].reservations[i];
            if (reservation.endTime > startTime) {
                reservation.endTime = startTime;
            }
        }
        creep.room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.push({
            creepId: creep.id,
            startTime,
            endTime,
            role: creep.memory.role,
        });
    }

    public static checkRoomReservationSetup(room: Room, pos?: RoomPosition | PathStep): void {
        if (!room.memory.positionReservations) {
            room.memory.positionReservations = {};
        }
        if (pos && !room.memory.positionReservations[`${pos.x},${pos.y}`]) {
            room.memory.positionReservations[`${pos.x},${pos.y}`] = {
                pos,
                reservations: [],
            };
        }
    }

    public static unreservePosition(creep: Creep, room: Room, pos: RoomPosition | PathStep): void {
        this.checkRoomReservationSetup(room, pos);
        for (let i = room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.length - 1; i >= 0; i--) {
            const reservation = room.memory.positionReservations[`${pos.x},${pos.y}`].reservations[i];
            if (reservation.creepId === creep.id) {
                room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.splice(i, 1);
                delete creep.memory.movementSystem?.reservationStartTime;
                delete creep.memory.movementSystem?.reservationEndTime;
            }
        }

        if (room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.length === 0) {
            delete room.memory.positionReservations[`${pos.x},${pos.y}`];
        }
    }

    public static unreservePositions(room: Room, pos: RoomPosition | PathStep): void {
        this.checkRoomReservationSetup(room, pos);
        for (let i = room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.length - 1; i >= 0; i--) {
            const reservation = room.memory.positionReservations[`${pos.x},${pos.y}`].reservations[i];
            const creepExists = Game.getObjectById(reservation.creepId);
            if (reservation.endTime < Game.time || !creepExists) {
                room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.splice(i, 1);
            }
        }
        if (room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.length === 0) {
            delete room.memory.positionReservations[`${pos.x},${pos.y}`];
        }
    }

    public static deletePastReservations(room: Room, pos: RoomPosition | PathStep): void {
        this.checkRoomReservationSetup(room, pos);
        for (let i = room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.length - 1; i >= 0; i--) {
            const reservation = room.memory.positionReservations[`${pos.x},${pos.y}`].reservations[i];
            const creepExists = Game.getObjectById(reservation.creepId);
            if (reservation.endTime < Game.time || !creepExists) {
                room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.splice(i, 1);
            }
        }
    }

    public static unreserveAll(creep: Creep): void {
        const room = creep.room;
        if (!room.memory.positionReservations) {
            return;
        }

        const keys = Object.keys(room.memory.positionReservations);
        for (const key of keys) {
            const entry = room.memory.positionReservations[key];
            if (!entry || !entry.reservations) continue;

            for (let i = entry.reservations.length - 1; i >= 0; i--) {
                if (entry.reservations[i].creepId === creep.id) {
                    entry.reservations.splice(i, 1);
                }
            }

            if (entry.reservations.length === 0) {
                delete room.memory.positionReservations[key];
            }
        }
        delete creep.memory.movementSystem?.reservationStartTime;
        delete creep.memory.movementSystem?.reservationEndTime;
    }
}
