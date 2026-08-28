interface Colony {
    id: string;
    setupComplete?: boolean;
    level: number;
    spawnEnergy: number;
    creeps: ColonyCreeps | undefined;
    rooms: { [roomName: string]: RoomData };
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
    expansionManagement?: ColonyExpansionManagement;
    labManagement?: ColonyLabManagement;
    observerManagement?: ColonyObserverManagement;
}

interface ColonyObserverManagement {
    /** Room requested via observeRoom last tick; vision arrives the tick after. */
    pendingRoom?: string;
}

interface BaseSystemInfo {
    nextUpdate: number;
    energyUsageTracking?: EnergyUsageTracking;
}

interface ColonyDefenseManagement extends BaseSystemInfo {
    /** Min-cut rampart perimeter positions for the main room. */
    perimeter?: { x: number; y: number }[];
    /** RCL at which the perimeter was last computed (recompute as the base grows). */
    lastPerimeterRcl?: number;
}

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

interface ColonyInfrastructureManagement extends BaseSystemInfo {
    roadCount?: number;
    roadMaintenanceCost?: number;
    lastRoadMaintenanceCheck?: number;
    lastRclPlanned?: number;
    lastPlannedTick?: number;
}

interface ColonyGoapManagement extends BaseSystemInfo {
    activeGoalName?: string;
    planActionNames?: string[];
}

interface ColonyExpansionManagement extends BaseSystemInfo {
    /** Room name this colony is currently expanding into. */
    expansionTarget?: string;
    /** Tick the current expansion attempt started (for stall detection). */
    expansionStartTime?: number;
}

interface ColonyLabManagement extends BaseSystemInfo {
    /** The two labs that hold reagents for the active reaction. */
    inputLabIds?: Id<StructureLab>[];
    /** The reagents loaded into the input labs (same order as inputLabIds). */
    reagents?: ResourceConstant[];
    /** The compound currently being produced. */
    product?: ResourceConstant;
    /** Raw minerals the terminal should buy to unblock the next wanted reaction. */
    buyRequests?: ResourceConstant[];
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
    /** Cached from the last time we had vision, so remotes can be sized without it. */
    energyCapacity?: number;
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
    sourceCount?: number;
    lastScouted?: number;
    distance?: number;
    owner?: string;
    reservation?: string;
    otherResources?: ResourceConstant[];
}

interface SourceData {
    id: string;
    position: RoomPosition;
    minerId?: string;
    collectorIds: string[];
}
