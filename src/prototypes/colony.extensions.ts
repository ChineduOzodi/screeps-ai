interface Colony {
    id: string;
    spawnIndex: number;
    setupComplete?: boolean;
    spawnEnergy: number;
    screepCount: ScreepCount;
    creeps: ColonyCreeps | undefined;
    rooms: RoomData[];
    mainSpawnId: string;
    spawnQueue: SpawnRequest[] | undefined;
    stats: ColonyStats;
    energyManagement: ColonyEnergyManagement;
    upgradeManagement: ColonyUpgradeManagement;
    builderManagement: ColonyBuilderManagement;
    defenceManagement: ColonyDefenceManagement;
    infrastructureManagement?: ColonyInfrastructureManagement;
}

interface ColonyBaseManagement {
    stage: number;
    nextUpdate: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ColonyDefenceManagement extends ColonyBaseManagement {}

interface ColonyBuilderManagement extends ColonyBaseManagement {
    builders?: ColonyCreepSpawnManagement;
    buildQueue: string[];
    builderEnergy: EnergyUsageTracking;
}

interface ColonyUpgradeManagement extends ColonyBaseManagement {
    upgraders?: ColonyCreepSpawnManagement;
    upgraderEnergy: EnergyUsageTracking;
}

interface ColonyEnergyManagement extends ColonyBaseManagement {
    lastUpdate?: number;
    sources: ColonySource[];
    estimatedEnergyProductionRate: number;
    estimatedEnergyProductionEfficiency?: number;
    totalEnergyUsagePercentageAllowed: number;
    energyUsageModifier: number;
}

interface ColonyInfrastructureManagement extends ColonyBaseManagement {
    repairers?: ColonyCreepSpawnManagement;
    fillers?: ColonyCreepSpawnManagement;
}

interface EnergyUsageTracking {
    estimatedEnergyWorkRate: number;
    allowedEnergyWorkRate: number;
    requestedEnergyUsagePercentage: number;
    actualEnergyUsagePercentage: number;
}

interface ColonySource {
    sourceId: string;
    position: RoomPosition;
    accessCount: number;
    cumulativeHarvestedEnergy?: number;
    harvesters?: ColonyCreepSpawnManagement;
    miners?: ColonyCreepSpawnManagement;
    carriers?: ColonyCreepSpawnManagement;
}

interface ColonyCreepSpawnManagement {
    desiredAmount: number;
    creepNames: string[];
    bodyBlueprint: BodyPartConstant[];
    memoryBlueprint: AddCreepToQueueOptions;
    important?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ColonyStats {}

interface SpawnRequest {
    body: BodyPartConstant[];
    memory: CreepMemory;
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
    defenders?: ColonyCreepSpawnManagement;
    alertLevel: number;
}

interface SourceData {
    id: string;
    position: RoomPosition;
    containerId?: string;
    minerId?: string;
    collectorIds: string[];
}
