interface Colony {
    id: string;
    spawnIndex: number;
    setupComplete?: boolean;
    spawnEnergy: number;
    screepCount: ScreepCount;
    creeps: ColonyCreeps;
    rooms: RoomData[];
    mainSpawnId: string;
    spawnQueue: SpawnRequest[];
    stats: ColonyStats;
    energyManagement: ColonyEnergyManagement;
    upgradeManagement: ColonyUpgradeManagement;
    builderManagement: ColonyBuilderManagement;
}

interface ColonyBuilderManagement {
    builders?: ColonyCreepSpawnManagement;
    buildQueue: string[];
    builderEnergy: EnergyUsageTracking;
}

interface ColonyUpgradeManagement {
    upgraders?: ColonyCreepSpawnManagement;
    upgraderEnergy: EnergyUsageTracking;
}

interface ColonyEnergyManagement {
    sources: ColonySources[];
    estimatedEnergyProductionRate: number;
    totalEnergyUsagePercentageAllowed: number;
    energyUsageModifier: number;
}

interface EnergyUsageTracking {
    estimatedEnergyWorkRate: number;
    allowedEnergyWorkRate: number;
    requestedEnergyUsagePercentage: number;
    actualEnergyUsagePercentage: number;
}

interface ColonySources {
    sourceId: string;
    position: RoomPosition;
    harvesters?: ColonyCreepSpawnManagement;
    miners?: ColonyCreepSpawnManagement;
    carriers?: ColonyCreepSpawnManagement;
}

interface ColonyCreepSpawnManagement {
    desiredAmount: number;
    creepNames: string[];
    bodyBlueprint: BodyPartConstant[];
    memoryBlueprint: AddCreepToQueueOptions;
}

interface ColonyStats {
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

