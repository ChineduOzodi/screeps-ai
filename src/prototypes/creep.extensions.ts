interface CreepMemory {
    name: string;
    colonyId: string;
    role: string;
    movementSystem: CreepMovementSystem 
    workTargetId?: string;
    targetId?: string;
    targetRange?: number;
    working: boolean;
    averageEnergyProductionPerTick?: number;
    workDuration: number;
}

interface AddCreepToQueueOptions {
    averageEnergyProductionPerTick?: number;
    workDuration?: number;
    workTargetId?: string;
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
    id?: string;
    status: CreepStatus;
}

enum CreepStatus {
    WORKING = 'working',
    IDLE = 'idle',
    SPAWN_QUEUE = 'spawn queue',
    SPAWNING = 'spawning'
}