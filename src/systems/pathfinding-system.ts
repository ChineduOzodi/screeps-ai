export class PathfindingSystem {
    public static findPathWithReservation(
        creep: Creep,
        target: RoomPosition | _HasRoomPosition,
        range: number,
        workDuration: number
    ): {
        path: PathStep[];
        startTime: number;
        endTime: number;
    } {
        const moveTime = creep.pos.findPathTo(target, {
            range,
            ignoreCreeps: true
        }).length;

        if (!creep.ticksToLive || (moveTime >= creep.ticksToLive && !workDuration)) {
            workDuration = 1;
        } else if (!workDuration) {
            workDuration = creep.ticksToLive - moveTime;
        }
        const startTime = Game.time + moveTime;
        const endTime = Game.time + moveTime + workDuration;

        const path = creep.pos.findPathTo(target, {
            range,
            ignoreCreeps: true,
            costCallback(roomName, costMatrix) {
                const room = Game.rooms[roomName];
                if (!room) return;

                PathfindingSystem.checkRoomReservationSetup(room);

                if (creep.room.memory.positionReservations) {
                    const keys = Object.keys(creep.room.memory.positionReservations);

                    for (const key of keys) {
                        const reservation = creep.room.memory.positionReservations[key];

                        if (reservation.reservations) {
                            if (
                                !PathfindingSystem.checkReservationAvailable(room, reservation.pos, startTime, endTime)
                            ) {
                                // console.log(`${reservation.pos.x}, ${reservation.pos.y} not available`);
                                costMatrix.set(reservation.pos.x, reservation.pos.y, 255);
                            }
                        }
                    }
                }
            }
        });

        // console.log(`${creep.name}, target pos: ${(target as _HasRoomPosition).pos.x},${(target as _HasRoomPosition).pos.y}, creep pos: ${creep.pos.x}, ${creep.pos.y}, path length: ${path.length}, range: ${range}`);
        return { path, startTime, endTime };
    }

    public static checkReservationAvailable(
        room: Room,
        pos: RoomPosition | PathStep,
        startTime: number,
        endTime?: number
    ): boolean {
        this.checkRoomReservationSetup(room, pos);
        for (const reservation of room.memory.positionReservations[`${pos.x},${pos.y}`].reservations) {
            if (startTime <= reservation.endTime) {
                // console.log(`${pos.x},${pos.y} reservation check: arriving too soon (${startTime} <= ${reservation.endTime})`);
                return false;
            }
            if (endTime && reservation.startTime <= endTime) {
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
        endTime: number
    ): void {
        this.checkRoomReservationSetup(creep.room, pos);
        this.deletePastReservations(creep.room, pos);
        creep.room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.push({
            creepId: creep.id,
            startTime,
            endTime
        });
    }

    public static checkRoomReservationSetup(room: Room, pos?: RoomPosition | PathStep): void {
        if (!room.memory.positionReservations) {
            room.memory.positionReservations = {};
        }
        if (pos && !room.memory.positionReservations[`${pos.x},${pos.y}`]) {
            room.memory.positionReservations[`${pos.x},${pos.y}`] = {
                pos,
                reservations: []
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
            if (reservation.endTime < Game.time) {
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
            if (reservation.endTime < Game.time) {
                room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.splice(i, 1);
            }
        }
    }
}
