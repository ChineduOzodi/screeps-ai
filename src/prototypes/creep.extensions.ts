interface CreepMemory {
    name: string;
    colonyId: string;
    role: string;
    movementSystem: CreepMovementSystem 
    sourceId?: string;
    targetId?: string;
    targetRange?: number;
    working: boolean;
    averageEnergyProductionPerTick?: number;
    sourceHarvestDuration?: number;
}

interface AddCreepToQueueOptions {
    averageEnergyProductionPerTick?: number;
    sourceHarvestDuration?: number;
    sourceId?: string;
    targetId?: string;
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