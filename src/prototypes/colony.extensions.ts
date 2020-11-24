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
}

interface ColonyEnergyManagement {
    sources: ColonySources[];
}

interface ColonySources {
    sourceId: string;
    position: RoomPosition;
    desiredHarvesters: number;
    harvesterNames: string[];
    harvesterMemoryBlueprint?: AddCreepToQueueOptions;
    harvesterBodyBlueprint?: BodyPartConstant[];
    minerName?: string;
    desiredCarriers: number;
    carrierNames: string[];
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

