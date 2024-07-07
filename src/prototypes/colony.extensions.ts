interface Colony {
    id: string;
    spawnIndex: number;
    setupComplete?: boolean;
    spawnEnergy: number;
    screepCount: ScreepCount;
    creeps: ColonyCreeps | undefined;
    rooms: RoomData[];
    mainSpawnId: Id<StructureSpawn>;
    spawnQueue: SpawnRequest[] | undefined;
    stats: ColonyStats;
    nextUpdate: number;
    energyManagement: ColonyEnergyManagement;
    upgradeManagement: ColonyUpgradeManagement;
    builderManagement: ColonyBuilderManagement;
    defenseManagement: ColonyDefenseManagement;
    infrastructureManagement?: ColonyInfrastructureManagement;
}

interface ColonyBaseSystemInfo {
    nextUpdate: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ColonyDefenseManagement extends ColonyBaseSystemInfo {}

interface ColonyBuilderManagement extends ColonyBaseSystemInfo {
    builders?: ColonyCreepSpawnManagement;
    buildQueue: string[];
    builderEnergy: EnergyUsageTracking;
}

interface ColonyUpgradeManagement extends ColonyBaseSystemInfo {
    upgraders?: ColonyCreepSpawnManagement;
    upgraderEnergy: EnergyUsageTracking;
}

interface ColonyEnergyManagement extends ColonyBaseSystemInfo {
    lastUpdate?: number;
    sources: ColonySource[];
    estimatedEnergyProductionRate: number;
    estimatedEnergyProductionEfficiency?: number;
    totalEnergyUsagePercentageAllowed: number;
    energyUsageModifier: number;
}

interface ColonyInfrastructureManagement extends ColonyBaseSystemInfo {
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
    sourceId: Id<Source>;
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
