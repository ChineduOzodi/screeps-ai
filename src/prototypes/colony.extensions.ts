interface Colony {
    id: string;
    spawnIndex: number;
    setupComplete?: boolean;
    spawnEnergy: number;
    creeps: ColonyCreeps | undefined;
    rooms: RoomData[];
    mainSpawnId: Id<StructureSpawn>;
    spawnQueue: SpawnRequest[] | undefined;
    stats: ColonyStats;
    nextUpdate: number;
    energyManagement?: ColonyEnergyManagement;
    upgradeManagement?: ColonyUpgradeManagement;
    builderManagement?: ColonyBuilderManagement;
    defenseManagement?: ColonyDefenseManagement;
    infrastructureManagement?: ColonyInfrastructureManagement;
}

interface BaseSystemInfo {
    nextUpdate: number;
    energyUsageTracking?: EnergyUsageTracking;
    creepSpawnersInfo: { [k: string]: CreepSpawnerProfileInfo };
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ColonyDefenseManagement extends BaseSystemInfo {}

interface ColonyBuilderManagement extends BaseSystemInfo {
    buildQueue: Id<ConstructionSite>[];
}

interface ColonyUpgradeManagement extends BaseSystemInfo {}

interface ColonyEnergyManagement extends BaseSystemInfo {
    sources: ColonySource[];
    estimatedEnergyProductionRate: number;
    totalEnergyUsagePercentageAllowed: number;
    energyUsageModifier: number;
}

interface ColonyInfrastructureManagement extends BaseSystemInfo {}

interface EnergyUsageTracking {
    estimatedEnergyWorkRate: number;
    allowedEnergyWorkRate: number;

    // Number is added to energy weights of other systems to determine the distribution of energy allowance.
    requestedEnergyUsageWeight: number;
    actualEnergyUsagePercentage: number;
}

interface EnergyTrackingInfo {
    /** How many ticks has been counted so far. */
    count?: number;
    average?: number;
    total?: number;
}

interface ColonySource {
    sourceId: Id<Source>;
    position: RoomPosition;
    accessCount: number;
}

interface CreepSpawnerProfileInfo {
    desiredAmount?: number;
    creepNames?: string[];
    bodyBlueprint?: BodyPartConstant[];
    memoryBlueprint?: AddCreepToQueueOptions;
    important?: boolean;
    /** Cost to spawn profile. A positive number. */
    spawnCostPerTick?: number;
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

interface RoomData {
    name: string;
    isMain?: boolean;
    alertLevel: number;
}

interface SourceData {
    id: string;
    position: RoomPosition;
    containerId?: string;
    minerId?: string;
    collectorIds: string[];
}
