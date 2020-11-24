interface CreepMemory {
    name: string;
    colonyId: string;
    role: string;
    sourceId?: string;
    averageEnergyProductionPerTick?: number;
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