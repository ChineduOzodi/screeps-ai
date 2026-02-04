interface Colony {
    id: string;
    setupComplete?: boolean;
    level: number;
    spawnEnergy: number;
    containerId?: Id<StructureContainer>;
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
    goapManagement?: ColonyGoapManagement;
}

interface BaseSystemInfo {
    nextUpdate: number;
    energyUsageTracking?: EnergyUsageTracking;
}

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
    storedEnergyPercent: number;
}

interface ColonyInfrastructureManagement extends BaseSystemInfo {}

interface ColonyGoapManagement extends BaseSystemInfo {
    activeGoalName?: string;
    planActionNames?: string[];
}

interface EnergyUsageTracking {
    estimatedEnergyWorkRate: number;
    allowedEnergyWorkRate: number;

    // Number is added to energy weights of other systems to determine the distribution of energy allowance.
    requestedEnergyUsageWeight: number;
    actualEnergyUsagePercentage: number;
}

interface ColonySource {
    sourceId: Id<Source>;
    position: RoomPosition;
    accessCount: number;
    miningPosition?: RoomPosition;
}

interface CreepSpawnerProfileInfo {
    desiredAmount?: number;

    bodyBlueprint?: BodyPartConstant[];
    memoryBlueprint?: AddCreepToQueueOptions;
    priority?: number;
    /** Cost to spawn profile. A positive number. */
    spawnCostPerTick?: number;
}

interface ColonyStats {}

interface SpawnRequest {
    body: BodyPartConstant[];
    memory: CreepMemory;
    priority: number;
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
