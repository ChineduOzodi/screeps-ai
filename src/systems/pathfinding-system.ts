export class PathfindingSystem {
    static findPathWithReservation(creep: Creep, target: any, range: number, workDuration: number) {
        const moveTime = creep.pos.findPathTo(target,
            {
                range: range,
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
            range: range,
            ignoreCreeps: true,
            costCallback: function (roomName, costMatrix) {

                let room = Game.rooms[roomName];
                if (!room) return;

                PathfindingSystem.checkRoomReservationSetup(room);

                if (creep.room.memory.positionReservations) {
                    const keys = Object.keys(creep.room.memory.positionReservations);

                    for (const key of keys) {
                        const reservation = creep.room.memory.positionReservations[key];

                        if (reservation.reservations) {
                            if (!PathfindingSystem.checkReservationAvailable(room, reservation.pos, startTime, endTime)) {
                                // console.log(`${reservation.pos.x}, ${reservation.pos.y} not available`);
                                costMatrix.set(reservation.pos.x, reservation.pos.y, 255);
                            }
                        }
                    }
                }
            }
        });

        return { path, startTime, endTime };
    }

    static checkReservationAvailable(room: Room, pos: RoomPosition | PathStep, startTime: number, endTime?: number) {
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

    static reserveLocation(creep: Creep, pos: RoomPosition | PathStep, startTime: number, endTime: number) {
        this.checkRoomReservationSetup(creep.room, pos);
        this.deletePastReservations(creep.room, pos);
        creep.room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.push(
            {
                creepId: creep.id,
                startTime,
                endTime
            }
        );
    }

    static checkRoomReservationSetup(room: Room, pos?: RoomPosition | PathStep) {
        if (!room.memory.positionReservations) {
            room.memory.positionReservations = {}
        }
        if (pos && !room.memory.positionReservations[`${pos.x},${pos.y}`]) {
            room.memory.positionReservations[`${pos.x},${pos.y}`] = {
                pos,
                reservations: []
            };
        }
    }

    static unreservePosition(creep: Creep, room: Room, pos: RoomPosition | PathStep) {
        this.checkRoomReservationSetup(room, pos);
        for (let i = room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.length - 1; i >= 0; i--) {
            const reservation = room.memory.positionReservations[`${pos.x},${pos.y}`].reservations[i];
            if (reservation.creepId === creep.id) {
                room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.splice(i, 1);
                delete creep.memory.movementSystem.reservationStartTime;
                delete creep.memory.movementSystem.reservationEndTime;
            }
        }

        if (room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.length == 0) {
            delete room.memory.positionReservations[`${pos.x},${pos.y}`];
        }
    }
    
    static unreservePositions(room: Room, pos: RoomPosition) {
        this.checkRoomReservationSetup(room, pos);
        for (let i = room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.length - 1; i >= 0; i--) {
            const reservation = room.memory.positionReservations[`${pos.x},${pos.y}`].reservations[i];
            if (reservation.endTime < Game.time) {
                room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.splice(i, 1);
            }
        }
        if (room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.length == 0) {
            delete room.memory.positionReservations[`${pos.x},${pos.y}`];
        }
    }

    static deletePastReservations(room: Room, pos: RoomPosition | PathStep) {
        this.checkRoomReservationSetup(room, pos);
        for (let i = room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.length - 1; i >= 0; i--) {
            const reservation = room.memory.positionReservations[`${pos.x},${pos.y}`].reservations[i];
            if (reservation.endTime < Game.time) {
                room.memory.positionReservations[`${pos.x},${pos.y}`].reservations.splice(i, 1);
            }
        }
    }
}