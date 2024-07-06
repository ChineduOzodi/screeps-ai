interface CreepMemory extends AddCreepToQueueOptions {
    name: string;
    colonyId: string;
    movementSystem?: CreepMovementSystem;
    targetId?: string;
    working: boolean;
    workDuration: number;
    cumulativeWork?: number;
}

interface AddCreepToQueueOptions {
    averageEnergyConsumptionProductionPerTick: number;
    role: string;
    workAmount?: number;
    workDuration?: number;
    workTargetId?: string;
    homeRoomName?: string;
    targetRange?: number;
}

interface CreepMovementSystem {
    previousPos: RoomPosition;
    idle: number;
    idleReserved: boolean;
    pathStuck: number;
    reservationStartTime?: number;
    reservationEndTime?: number;
    path?: PathStep[];
}

interface CreepData {
    name: string;
    /** I believe this can be null if the creep is dead. */
    id?: Id<Creep>;
    status: CreepStatus;
}

enum CreepStatus {
    WORKING = "working",
    IDLE = "idle",
    SPAWN_QUEUE = "spawn queue",
    SPAWNING = "spawning"
}
