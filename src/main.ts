import { RoomExtras } from './prototypes/room';
import { CreepExtras } from './prototypes/creep';
import { ColonyExtras } from './prototypes/colony';
import { SpawnExtras } from "prototypes/spawn";
import { ErrorMapper } from "utils/ErrorMapper";

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }

  if (!Memory.colonies) {
    Memory.colonies = {}
  }

  for (const name in Memory.colonies) {
    const colony = new ColonyExtras(Memory.colonies[name]);
    colony.run();
  }

  for (const name in Game.spawns) {
    const spawn = new SpawnExtras(Game.spawns[name]);
    spawn.run();
  }

  for (const name in Game.creeps) {
    const creep = new CreepExtras(Game.creeps[name]);
    creep.run();
  }

  for (const name in Game.rooms) {
    const room = new RoomExtras(Game.rooms[name]);
    room.run();
  }
});
