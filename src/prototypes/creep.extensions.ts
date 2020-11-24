interface CreepMemory {
    name: string;
    colonyId: string;
    role: string;
    movementSystem: CreepMovementSystem 
    sourceId?: string;
    targetId?: string;
    targetRange?: number;
    averageEnergyProductionPerTick?: number;
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