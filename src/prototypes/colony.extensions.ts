interface Colony {
    id: string;
    spawnIndex: number;
    setupComplete?: boolean;
    spawnEnergy: number;
    screepCount: ScreepCount;
    creeps: ColonyCreeps;
    rooms: ScreepRooms;
    mainSpawnId: string;
    spawnQueue: SpawnRequest[];
    stats: ColonyStats;
    energyManagement: ColonyEnergyManagement;
    upgradeManagement: ColonyUpgradeManagement;
}

interface ColonyUpgradeManagement {
    upgraders?: ColonyCreepSpawnManagement;
}

interface ColonyEnergyManagement {
    sources: ColonySources[];
}

interface ColonySources {
    sourceId: string;
    position: RoomPosition;
    harvesters?: ColonyCreepSpawnManagement;
    miners?: ColonyCreepSpawnManagement;
    carriers?: ColonyCreepSpawnManagement;
}

interface ColonyCreepSpawnManagement {
    role: string;
    desiredAmount: number;
    creepNames: string[];
    bodyBlueprint: BodyPartConstant[];
    memoryBlueprint?: AddCreepToQueueOptions;
}

interface ColonyStats {
    estimatedEnergyProductionRate: number;
}

interface SpawnRequest {
    body: BodyPartConstant[],
    memory: CreepMemory
}

interface ColonyCreeps {
    [name: string]: CreepData;
}

interface ScreepCount {
    [role: string]: ScreepCountStats;
}

interface ScreepCountStats {
    spawning: number;
    count: number;
    desired: number;
}

interface ScreepRooms {
    [name: string]: RoomData;
}

interface RoomData {
    name: string;
    isMain?: boolean;
}

interface SourceData {
    id: string;
    position: RoomPosition,
    containerId?: string;
    minerId?: string;
    collectorIds: string[];
}

