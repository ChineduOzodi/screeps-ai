import { PathfindingUtils } from "../utils/pathfinding-utils";

export class Movement {
    public static run(creep: Creep): void {
        const ticksToLive = creep.ticksToLive ? creep.ticksToLive : 0;
        if (!creep.memory.movementSystem) {
            creep.memory.movementSystem = Movement.createMovementSystem(creep.pos);
        }

        if (
            creep.memory.movementSystem.previousPos.x === creep.pos.x &&
            creep.memory.movementSystem.previousPos.y === creep.pos.y
        ) {
            creep.memory.movementSystem.idle++;
            creep.memory.movementSystem.pathStuck++;
        } else {
            if (creep.memory.movementSystem.idleReserved) {
                PathfindingUtils.unreservePosition(creep, creep.room, creep.memory.movementSystem.previousPos);
                creep.memory.movementSystem.idleReserved = false;
            }
            creep.memory.movementSystem.idle = 0;
            creep.memory.movementSystem.pathStuck = 0;
            creep.memory.movementSystem.previousPos = creep.pos;
        }

        if (
            creep.memory.movementSystem.idle >= 10 &&
            PathfindingUtils.checkReservationAvailable(
                creep.room.name,
                creep.pos,
                Game.time,
                Game.time + 1,
                undefined,
                creep.name,
            )
        ) {
            PathfindingUtils.reserveLocation(creep, creep.pos, Game.time, Game.time + ticksToLive);
            creep.memory.movementSystem.idleReserved = true;
        }

        // requirements
        if (
            creep.memory.movementSystem.path &&
            (creep.memory.targetId || creep.memory.targetPos) &&
            (creep.memory.targetRange != null || creep.memory.targetRange !== undefined)
        ) {
            // Re-inflate path RoomPositions from memory if they are plain objects
            if (
                creep.memory.movementSystem.path.length > 0 &&
                typeof (creep.memory.movementSystem.path[0] as any).getRangeTo !== "function"
            ) {
                // Safety check for stale data (old PathStep format)
                if (typeof (creep.memory.movementSystem.path[0] as any).roomName === "undefined") {
                    delete creep.memory.movementSystem.path;
                } else {
                    creep.memory.movementSystem.path = creep.memory.movementSystem.path.map(
                        p => new RoomPosition(p.x, p.y, p.roomName),
                    );
                }
            }

            let targetPos: RoomPosition | undefined;
            if (creep.memory.targetId) {
                const target = Game.getObjectById<Structure>(creep.memory.targetId);
                if (!target) {
                    console.log(`${creep.name}: target no longer exists (ID: ${creep.memory.targetId})`);
                    PathfindingUtils.unreserveAll(creep);
                    delete creep.memory.movementSystem.path;
                    delete creep.memory.targetId;
                    delete creep.memory.targetPos;
                    return;
                }
                targetPos = target.pos;
            } else if (creep.memory.targetPos) {
                // Reconstruct RoomPosition from memory
                const memPos = creep.memory.targetPos as any; // Handle serialized object
                targetPos = new RoomPosition(memPos.x, memPos.y, memPos.roomName);
            }

            if (targetPos) {
                if (creep.pos.getRangeTo(targetPos) <= creep.memory.targetRange) {
                    PathfindingUtils.unreserveAll(creep);
                    delete creep.memory.movementSystem.path;
                    delete creep.memory.targetId;
                    delete creep.memory.targetPos;
                    creep.memory.movementSystem.idleReserved = true;
                    creep.memory.movementSystem.previousPos = creep.pos;
                } else if (creep.memory.movementSystem.path) {
                    // Path maintenance: skip steps we've already reached
                    while (creep.memory.movementSystem.path && creep.memory.movementSystem.path.length > 0) {
                        const step = creep.memory.movementSystem.path[0];
                        if (creep.pos.x === step.x && creep.pos.y === step.y && creep.room.name === step.roomName) {
                            creep.memory.movementSystem.path.shift();
                        } else {
                            break;
                        }
                    }

                    if (!creep.memory.movementSystem.path || creep.memory.movementSystem.path.length === 0) {
                        PathfindingUtils.unreserveAll(creep);
                        delete creep.memory.movementSystem.path;
                        delete creep.memory.targetId;
                        delete creep.memory.targetPos;
                        return;
                    }

                    const nextStep = creep.memory.movementSystem.path[0];
                    if (creep.pos.isNearTo(nextStep)) {
                        const direction = creep.pos.getDirectionTo(nextStep);
                        const status = creep.move(direction);

                        if (status !== OK && status !== ERR_TIRED) {
                            console.log(
                                `${creep.name}: move to ${nextStep} failed with status ${status}. Target: ${targetPos}`,
                            );
                            creep.say(`resetting`);
                            PathfindingUtils.unreserveAll(creep);
                            delete creep.memory.movementSystem.path;
                            delete creep.memory.targetId;
                            delete creep.memory.targetPos;
                            creep.memory.movementSystem.pathStuck = 0;
                            // reserve current location
                            PathfindingUtils.reserveLocation(creep, creep.pos, Game.time, Game.time + ticksToLive);
                            creep.memory.movementSystem.idleReserved = true;
                        }
                    } else {
                        // Off path - might have jumped a room or been pushed
                        console.log(`${creep.name}: off path at ${creep.pos}. Next step: ${nextStep}`);
                        PathfindingUtils.unreserveAll(creep);
                        delete creep.memory.movementSystem.path;
                        delete creep.memory.targetId;
                        delete creep.memory.targetPos;
                    }

                    if (
                        (creep.memory.movementSystem.pathStuck >= 10 || ticksToLive === 1) &&
                        creep.memory.movementSystem.path
                    ) {
                        const nextStepLog = creep.memory.movementSystem.path[0];
                        console.log(
                            `${creep.name}: path stuck at ${creep.pos}. Next step: ${nextStepLog}. Target: ${targetPos}. Idle: ${creep.memory.movementSystem.idle}`,
                        );
                        creep.say("path stuck");
                        PathfindingUtils.unreserveAll(creep);
                        delete creep.memory.movementSystem.path;
                        delete creep.memory.targetId;
                        delete creep.memory.targetPos;
                        creep.memory.movementSystem.pathStuck = Math.random() * 3;
                        // reserve current location
                        PathfindingUtils.reserveLocation(creep, creep.pos, Game.time, Game.time + ticksToLive);
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
            idleReserved: false,
        };
    }

    public static moveToTargetByPath(
        creep: Creep,
        targetId: string | undefined,
        targetPos: RoomPosition | undefined,
        targetRange: number,
        path: RoomPosition[],
    ): void {
        if (creep.memory.movementSystem) {
            creep.memory.movementSystem.path = path;
            creep.memory.targetId = targetId;
            creep.memory.targetPos = targetPos;
            creep.memory.targetRange = targetRange;
            creep.memory.movementSystem.pathStuck = 0;
        } else {
            console.log(`movement-system | creep ${creep.id} could not move because no movement system`);
        }
    }

    public static moveToTargetByPathWithReservation(
        creep: Creep,
        targetId: string | undefined,
        targetPos: RoomPosition | undefined,
        targetRange: number,
        path: RoomPosition[],
        startTime: number,
        endTime: number,
    ): void {
        if (creep.memory.movementSystem) {
            creep.memory.movementSystem.path = path;
            creep.memory.targetId = targetId;
            creep.memory.targetPos = targetPos;
            creep.memory.targetRange = targetRange;
            creep.memory.movementSystem.pathStuck = 0;
            creep.memory.movementSystem.reservationStartTime = startTime;
            creep.memory.movementSystem.reservationEndTime = endTime;

            PathfindingUtils.reserveLocation(creep, path[path.length - 1], startTime, endTime);
        } else {
            console.log(`movement-system | creep ${creep.id} could not move because no movement system`);
        }
    }

    public static moveTo(creep: Creep, target: Structure | _HasRoomPosition, range = 1): void {
        if (creep.spawning || creep.memory.movementSystem?.path) {
            return;
        }

        PathfindingUtils.unreserveAll(creep);
        const path = PathfindingUtils.findPathWithReservation(creep, target, range, 1).path;

        if (path && path.length > 0) {
            this.moveToTargetByPath(
                creep,
                (target as any).id,
                (target as any).id ? undefined : target.pos,
                range,
                path,
            );
        }
    }

    public static moveToWithReservation(
        creep: Creep,
        target: _HasRoomPosition & Partial<_HasId>,
        workDuration: number,
        range = 1,
        ignoreRoles?: string[],
    ): void {
        if (creep.spawning) {
            console.log(`creep still spawning:`, creep.name);
            return;
        }

        if (creep.memory.movementSystem?.path) {
            return;
        }

        PathfindingUtils.unreserveAll(creep);
        const pathInfo = PathfindingUtils.findPathWithReservation(creep, target, range, workDuration, ignoreRoles);

        if (pathInfo.path && pathInfo.path.length > 0) {
            this.moveToTargetByPathWithReservation(
                creep,
                target.id,
                target.id ? undefined : target.pos, // If no ID, use pos
                range,
                pathInfo.path,
                pathInfo.startTime,
                pathInfo.endTime,
            );
        } else {
            console.log(`${creep.name}: did not found path`);
        }
    }
}
