import {assert} from "chai";
import {Game, Memory} from "./mock";
import { SpawnExtras } from "prototypes/spawn";

import {loop} from "../../src/main";
import { createFakeStructureSpawn, createFakeRoom } from "./fakes";

describe("spawn", () => {

  let spawn: SpawnExtras;

  before(() => {
    // runs before all test in this block
  });

  beforeEach(() => {
    // runs before each test in this block
    // @ts-ignore : allow adding Game to global
    global.Game = _.clone(Game);
    // @ts-ignore : allow adding Memory to global
    global.Memory = _.clone(Memory);
    loop();

    const structureSpawn = createFakeStructureSpawn("test_id", "room_id");
    const room = createFakeRoom("room_id");
    Game.spawns[structureSpawn.id.toString()] = structureSpawn;
    Game.rooms[room.name] = room;

    spawn = new SpawnExtras(structureSpawn);
  });

  it("should run initial room setup", () => {
    spawn.run();
    assert.exists(Memory.colonies["room_id"]);
  });
});
