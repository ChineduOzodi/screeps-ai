
export enum CreepStatus {
    WORKING = "working",
    IDLE = "idle",
    SPAWN_QUEUE = "spawn queue",
    SPAWNING = "spawning",
}

export enum CreepWorkPastAction {
    NONE = "none",
    MOVE = "move",

    /** Transfer resource from the creep to another object. */
    TRANSFER = "transfer",
    HARVEST = "harvest",

    /** Withdraw resources from a structure, a tombstone or a ruin. */
    WITHDRAW = "withdraw",

    /** Pick up an item (a dropped piece of energy). */
    PICKUP = "pickup",

    /** Repair a damaged structure using carried energy. */
    REPAIR = "repair",

    /** Build a structure at the target construction site using carried energy. */
    BUILD = "build",
    ATTACK = "attack",
    UPGRADE_CONTROLLER = "upgrade",
}

export enum CreepRole {
    REPAIRER = "repairer",
    BUILDER = "builder",
    HARVESTER = "harvester",
    DEFENDER = "defender",
    UPGRADER = "upgrader",
    MINER = "miner",
    CARRIER = "carrier",
}

export interface CreepProfiles {
    [k: string]: CreepSpawnerProfileInfo;
}

export interface ColonyCreeps {
    [name: string]: CreepData;
}

export interface BaseSystem {
    /** Reference to the system data that lives in screeps. */
    get systemInfo(): BaseSystemInfo;

    /** Reference to the energy usage tracking data that lives in screeps. */
    get energyUsageTracking(): EnergyUsageTracking;

    /** What happens when an new colony is started. */
    onStart(): void;

    run(): void;

    /** Functionality to update profiles of creeps to be spawned by the spawning system. Primarily invoked by colony manager. */
    updateProfiles(): void;

    /** Get Roles to track energy */
    getRolesToTrackEnergy(): CreepRole[];

    getSpawnerProfilesList(): CreepSpawnerProfileInfo[];

    /**
     * Returns the number of creeps that are alive with chosen role for this system.
     * @param role role to count.
     */
    getRoleCount(role: CreepRole): number;

    getGoapGoals(state: any): any[];

    getGoapActions(): any[];
}

export interface Systems {
    energy: any;
    defense: any;
    infrastructure: any;
    upgrade: any;
    builder: any;
    goap: any;
}

export interface ColonyManager {
    get colonyInfo(): Colony;
    get systems(): Systems;
    get builderManagement(): ColonyBuilderManagement | undefined;
    get energyManagement(): ColonyEnergyManagement | undefined;
    get creeps(): ColonyCreeps;

    getMainRoom(): Room;
    getMainSpawn(): StructureSpawn;
    getColonyCreeps(): ColonyCreeps;
    getCreepData(name: string): CreepData | undefined;
    getSpawnQueue(): SpawnRequest[];
    addToSpawnCreepQueue(bodyBlueprint: BodyPartConstant[], memoryBlueprint: AddCreepToQueueOptions): string;
    getTotalEstimatedEnergyFlowRate(role: CreepRole | string): number;
    getCreepCount(role: CreepRole): number;
    /** List version of systems used in colony. */
    getSystemsList(): BaseSystem[];
    getCreeps(): Creep[];
    removeSpawnRequest(name: string): void;
    getPrimaryStorage(): StructureStorage | StructureContainer | undefined;
    
    constructionManager: any;
    roadManager: any;
}
