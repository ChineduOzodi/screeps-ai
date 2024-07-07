export interface FakeGame {
  creeps: {[creepName: string]: Creep};
  rooms: {[roomName: string]: Room};
  spawns: {[spawnName: string]: StructureSpawn};
  time: number;
}

export const Game: FakeGame = {
  creeps: {},
  rooms: {},
  spawns: {},
  time: 12345,
};

export const Memory: Memory = {
  creeps: {},
  colonies: {},
  powerCreeps: {},
  flags: {},
  rooms: {},
  spawns: {}
};
