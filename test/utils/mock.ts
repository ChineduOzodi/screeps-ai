export interface FakeGame {
    creeps: { [creepName: string]: Creep };
    rooms: { [roomName: string]: Room };
    spawns: { [spawnName: string]: StructureSpawn };
    constructionSites: { [siteId: string]: ConstructionSite };
    time: number;
    getObjectById?: (id: string) => any;
}

export const Game: FakeGame = {
    creeps: {},
    rooms: {},
    spawns: {},
    constructionSites: {},
    time: 12345,
    getObjectById: () => null,
};

export const Memory: Memory = {
    creeps: {},
    colonies: {},
    powerCreeps: {},
    flags: {},
    rooms: {},
    spawns: {},
} as any;
