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
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ColonyDefenceManagement {}

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
    stage: number;
    lastUpdate?: number;
    nextUpdate: number;
    sources: ColonySource[];
    estimatedEnergyProductionRate: number;
    estimatedEnergyProductionEfficiency?: number;
    totalEnergyUsagePercentageAllowed: number;
    energyUsageModifier: number;
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
