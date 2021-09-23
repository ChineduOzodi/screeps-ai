import { PathfindingSystem } from "./pathfinding-system";

export class MovementSystem {
    public static run(creep: Creep): void {
        const ticksToLive = creep.ticksToLive ? creep.ticksToLive : 0;
        if (!creep.memory.movementSystem) {
            creep.memory.movementSystem = MovementSystem.createMovementSystem(creep.pos);
        }

        if (
            creep.memory.movementSystem.previousPos.x === creep.pos.x &&
            creep.memory.movementSystem.previousPos.y === creep.pos.y
        ) {
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

        if (
            creep.memory.movementSystem.idle >= 10 &&
            PathfindingSystem.checkReservationAvailable(creep.room, creep.pos, Game.time, Game.time + 1)
        ) {
            PathfindingSystem.reserveLocation(creep, creep.pos, Game.time, Game.time + ticksToLive);
            creep.memory.movementSystem.idleReserved = true;
        }

        // requirements
        if (
            creep.memory.movementSystem.path &&
            creep.memory.targetId &&
            (creep.memory.targetRange != null || creep.memory.targetRange !== undefined)
        ) {
            const target = Game.getObjectById<Structure>(creep.memory.targetId);
            if (!target) {
                console.log(`${creep.name}: target no longer exists`);
                delete creep.memory.movementSystem.path;
                delete creep.memory.targetId;
            } else {
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

                    if (status !== OK && status !== ERR_TIRED && status !== ERR_BUSY) {
                        console.log(`${creep.name}: resetting path due to error: ${status}`);
                        PathfindingSystem.unreservePosition(creep, creep.room, lastPathStep);
                        delete creep.memory.movementSystem.path;
                        delete creep.memory.targetId;
                        creep.memory.movementSystem.pathStuck = 0;
                        // reserve current location
                        PathfindingSystem.reserveLocation(creep, creep.pos, Game.time, Game.time + ticksToLive);
                        creep.memory.movementSystem.idleReserved = true;
                    }

                    if (
                        (creep.memory.movementSystem.pathStuck >= 10 || ticksToLive === 1) &&
                        creep.memory.movementSystem.path
                    ) {
                        creep.say("path stuck");
                        PathfindingSystem.unreservePosition(creep, creep.room, lastPathStep);
                        delete creep.memory.movementSystem.path;
                        delete creep.memory.targetId;
                        creep.memory.movementSystem.pathStuck = Math.random() * 3;
                        // reserve current location
                        PathfindingSystem.reserveLocation(creep, creep.pos, Game.time, Game.time + ticksToLive);
                        creep.memory.movementSystem.idleReserved = true;
                    }
                }
            }
        }
    }

    public static createMovementSystem(previousPos: RoomPosition): CreepMovementSystem {
        return {
            previousPos,
            idle: 0,
            pathStuck: 0,
            idleReserved: false
        };
    }

    public static moveToTargetByPath(creep: Creep, targetId: string, targetRange: number, path: PathStep[]): void {
        if (creep.memory.movementSystem) {
            creep.memory.movementSystem.path = path;
            creep.memory.targetId = targetId;
            creep.memory.targetRange = targetRange;
            creep.memory.movementSystem.pathStuck = 0;
        } else {
            console.log(`movement-system | creep ${creep.id} could not move because no movement system`);
        }
    }

    public static moveToTargetByPathWithReservation(
        creep: Creep,
        targetId: string,
        targetRange: number,
        path: PathStep[],
        startTime: number,
        endTime: number
    ): void {
        if (creep.memory.movementSystem) {
            creep.memory.movementSystem.path = path;
            creep.memory.targetId = targetId;
            creep.memory.targetRange = targetRange;
            creep.memory.movementSystem.pathStuck = 0;
            creep.memory.movementSystem.reservationStartTime = startTime;
            creep.memory.movementSystem.reservationEndTime = endTime;

            PathfindingSystem.reserveLocation(creep, path[path.length - 1], startTime, endTime);
        } else {
            console.log(`movement-system | creep ${creep.id} could not move because no movement system`);
        }
    }

    public static moveTo(creep: Creep, target: Structure, range = 1): void {
        if (creep.spawning || creep.memory.movementSystem?.path) {
            return;
        }

        PathfindingSystem.unreservePosition(creep, creep.room, creep.pos);
        const path = creep.pos.findPathTo(target, {
            range,
            ignoreCreeps: true,
            costCallback(roomName, costMatrix) {
                const room = Game.rooms[roomName];
                if (!room) return;

                if (creep.room.memory.positionReservations) {
                    const keys = Object.keys(creep.room.memory.positionReservations);

                    for (const key of keys) {
                        const reservation = creep.room.memory.positionReservations[key];

                        if (reservation.reservations) {
                            const ticksToLive = creep.ticksToLive ? creep.ticksToLive : 0;
                            if (
                                !PathfindingSystem.checkReservationAvailable(
                                    room,
                                    reservation.pos,
                                    Game.time,
                                    Game.time + ticksToLive
                                )
                            ) {
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

    public static moveToWithReservation(
        creep: Creep,
        target: Structure | Source | Tombstone | Resource | ConstructionSite | Creep,
        workDuration: number,
        range = 1
    ): void {
        if (creep.spawning) {
            console.log(`creep still spawning:`, creep.name);
            return;
        }

        if (creep.memory.movementSystem?.path) {
            return;
        }

        PathfindingSystem.unreservePosition(creep, creep.room, creep.pos);
        const pathInfo = PathfindingSystem.findPathWithReservation(creep, target, range, workDuration);

        if (pathInfo.path && pathInfo.path.length > 0) {
            this.moveToTargetByPathWithReservation(
                creep,
                target.id,
                range,
                pathInfo.path,
                pathInfo.startTime,
                pathInfo.endTime
            );
        } else {
            console.log(`${creep.name}: did not found path`);
        }
    }
}
