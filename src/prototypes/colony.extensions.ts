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
    sources: SourceData[];
}

interface SourceData {
    id: string;
    position: RoomPosition,
    containerId?: string;
    minerId?: string;
    collectorIds: string[];
}

