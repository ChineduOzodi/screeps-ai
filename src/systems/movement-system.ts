import { PathfindingSystem } from './pathfinding-system';
export class MovementSystem {
    static run(creep: Creep) {
        const ticksToLive = creep.ticksToLive ? creep.ticksToLive : 0;

        if (creep.memory.movementSystem.previousPos.x == creep.pos.x && creep.memory.movementSystem.previousPos.y == creep.pos.y) {
            creep.memory.movementSystem.idle++;
            creep.memory.movementSystem.pathStuck++;
        } else {
            if (creep.memory.movementSystem.idleReserved) {
                PathfindingSystem.unreservePosition(creep, creep.room, creep.memory.movementSystem.previousPos);
                creep.memory.movementSystem.idleReserved = false;
            }
            creep.memory.movementSystem.idle = 0;
            creep.memory.movementSystem.pathStuck = 0;
            creep.memory.movementSystem.previousPos = creep.pos;
        }

        if (creep.memory.movementSystem.idle >= 10 && !creep.memory.movementSystem.idleReserved) {
            PathfindingSystem.reserveLocation(creep, creep.pos, Game.time, Game.time + ticksToLive);
            creep.memory.movementSystem.idleReserved = true;
        }


        //requirements
        if (creep.memory.movementSystem.path && creep.memory.targetId && (creep.memory.targetRange != null || creep.memory.targetRange != undefined)) {
            const target = Game.getObjectById<Structure>(creep.memory.targetId);
            if (!target) {
                console.log(`${creep.name}: target no longer exists`);
            }
            if (target && creep.pos.getRangeTo(target.pos) <= creep.memory.targetRange) {
                // console.log('reached target: ' + creep.memory.spawnId);
                // sMovementPathfinding.unreservePosition(creep,creep.room,creep.memory.path[creep.memory.path.length - 1]);
                delete creep.memory.movementSystem.path;
                delete creep.memory.targetId;
                creep.memory.movementSystem.idleReserved = true;
                creep.memory.movementSystem.previousPos = creep.pos;
            } else {
                // console.log('running movement for creep: ' + creep.memory.spawnId);
                const status = creep.moveByPath(creep.memory.movementSystem.path);
                const lastPathStep = creep.memory.movementSystem.path[creep.memory.movementSystem.path.length - 1];

                if (status != 0 && status != -11 && status != -4) {
                    console.log(`${creep.name}: reseting path due to error`);
                    console.log(status);
                    PathfindingSystem.unreservePosition(creep, creep.room, lastPathStep);
                    delete creep.memory.movementSystem.path;
                    delete creep.memory.targetId;
                    creep.memory.movementSystem.pathStuck = 0;
                }

                if (creep.memory.movementSystem.pathStuck >= 6 || ticksToLive === 1) {
                    creep.say('path stuck');
                    PathfindingSystem.unreservePosition(creep, creep.room, lastPathStep);
                    creep.memory.movementSystem.idleReserved = false;
                    delete creep.memory.movementSystem.path;
                    delete creep.memory.targetId;
                    creep.memory.movementSystem.pathStuck = 0;
                }

            }

        }
    }

    static moveToTargetByPath(creep: Creep, targetId: string, targetRange: number, path: PathStep[]) {
        creep.memory.movementSystem.path = path;
        creep.memory.targetId = targetId;
        creep.memory.targetRange = targetRange;
        creep.memory.movementSystem.pathStuck = 0;
    }

    static moveToTargetByPathWithReservation(creep: Creep, targetId: string, targetRange: number, path: PathStep[], startTime: number, endTime: number) {
        creep.memory.movementSystem.path = path;
        creep.memory.targetId = targetId;
        creep.memory.targetRange = targetRange;
        creep.memory.movementSystem.pathStuck = 0;
        creep.memory.movementSystem.reservationStartTime = startTime;
        creep.memory.movementSystem.reservationEndTime = endTime;

        PathfindingSystem.reserveLocation(creep, path[path.length - 1], startTime, endTime);
    }

    static moveTo(creep: Creep, target: Structure, range: number = 1) {
        if (creep.spawning || creep.memory.movementSystem.path) {
            return;
        }

        PathfindingSystem.unreservePosition(creep, creep.room, creep.pos);
        const path = creep.pos.findPathTo(target, {
            range: range,
            ignoreCreeps: true,
            costCallback: function (roomName, costMatrix) {

                let room = Game.rooms[roomName];
                if (!room) return;

                if (creep.room.memory.positionReservations) {
                    const keys = Object.keys(creep.room.memory.positionReservations);

                    for (const key of keys) {
                        const reservation = creep.room.memory.positionReservations[key];

                        if (reservation.reservations) {
                            const ticksToLive = creep.ticksToLive ? creep.ticksToLive : 0;
                            if (!PathfindingSystem.checkReservationAvailable(room, reservation.pos, Game.time, Game.time + ticksToLive)) {
                                costMatrix.set(reservation.pos.x, reservation.pos.y, 255);
                            }
                        }
                    }
                }
            }
        });

        if (path && path.length > 0) {
            this.moveToTargetByPath(creep, target.id, range, path);
        }
        // console.log(path);

    }

    static moveToWithReservation(creep: Creep, target: Structure | Source, workDuration: number, range: number = 1) {
        if (creep.spawning) {
            console.log(`creep still spawning:`, creep.id);
            creep.say('moveToWithReservation - still spawning');
            return;
        }

        if (creep.memory.movementSystem.path) {
            return;
        }

        PathfindingSystem.unreservePosition(creep, creep.room, creep.pos);
        const pathInfo = PathfindingSystem.findPathWithReservation(creep, target, range, workDuration);

        if (pathInfo.path && pathInfo.path.length > 0) {
            this.moveToTargetByPathWithReservation(creep, target.id, range, pathInfo.path, pathInfo.startTime, pathInfo.endTime);
        }
    }
}