import { assert } from "chai";
import _ from "lodash";
import "./colony.extensions";
import "./creep.extensions";
import "./memory.extensions";
import "./room.extensions";
import { Game, Memory } from "../../test/utils/mock";
import { ColonyManagerImpl } from "./colony";
import { CreepStatus } from "./types";

describe("ColonyManager Cleanup", () => {
    let colonyData: any;
    let colonyManager: ColonyManagerImpl;

    beforeEach(() => {
        // @ts-ignore
        global.Game = _.cloneDeep(Game);
        // @ts-ignore
        global.Memory = _.cloneDeep(Memory);

        colonyData = {
            id: "E1S1",
            level: 1,
            spawnEnergy: 0,
            creeps: {},
            rooms: [],
            mainSpawnId: "Spawn1" as any,
            spawnQueue: [],
            stats: {},
            nextUpdate: 0,
        };

        // @ts-ignore
        const mockRoom = {
            name: "E1S1",
            storage: undefined,
            find: () => [],
            controller: { level: 1 },
            memory: { constructionProjects: {} },
            visual: {
                text: () => {
                    /* mock */
                },
                rect: () => {
                    /* mock */
                },
            },
        };
        // @ts-ignore
        global.Game.rooms.E1S1 = mockRoom;

        colonyManager = new ColonyManagerImpl(colonyData);
    });

    describe("creepManager", () => {
        it("should delete a creep from colonyInfo.creeps if it's dead (has ID, not in Game.creeps)", () => {
            colonyData.creeps.deadCreep = {
                name: "deadCreep",
                id: "deadId" as any,
                status: CreepStatus.WORKING,
            };
            // global.Game.creeps is empty by default in mock

            (colonyManager as any).creepManager();

            assert.isUndefined(colonyData.creeps.deadCreep);
        });

        it("should delete a creep if status is SPAWN_QUEUE but it's not in the spawnQueue", () => {
            colonyData.creeps.missingInQueue = {
                name: "missingInQueue",
                status: CreepStatus.SPAWN_QUEUE,
            };
            colonyData.spawnQueue = []; // Empty queue

            (colonyManager as any).creepManager();

            assert.isUndefined(colonyData.creeps.missingInQueue);
        });

        it("should keep a creep if it's alive in Game.creeps", () => {
            colonyData.creeps.aliveCreep = {
                name: "aliveCreep",
                id: "aliveId" as any,
                status: CreepStatus.WORKING,
            };
            // @ts-ignore
            global.Game.creeps.aliveCreep = { name: "aliveCreep", id: "aliveId" } as any;

            (colonyManager as any).creepManager();

            assert.isDefined(colonyData.creeps.aliveCreep);
        });

        it("should keep a creep if it's in SPAWN_QUEUE and is in the spawnQueue", () => {
            colonyData.creeps.inQueueCreep = {
                name: "inQueueCreep",
                status: CreepStatus.SPAWN_QUEUE,
            };
            colonyData.spawnQueue = [
                {
                    memory: { name: "inQueueCreep" },
                    body: [],
                    priority: 0,
                },
            ];

            (colonyManager as any).creepManager();

            assert.isDefined(colonyData.creeps.inQueueCreep);
        });

        it("should delete a ghost creep (not in Game.creeps, not in queue, no ID)", () => {
            colonyData.creeps.ghostCreep = {
                name: "ghostCreep",
                status: CreepStatus.WORKING,
                // no id
            };

            (colonyManager as any).creepManager();

            assert.isUndefined(colonyData.creeps.ghostCreep);
        });
    });

    describe("initialSetup", () => {
        it("should clear Memory.rooms[roomName] if it exists", () => {
            // @ts-ignore
            global.Memory.rooms.E1S1 = { some: "data" } as any;

            (colonyManager as any).initialSetup();

            // @ts-ignore
            assert.isUndefined(global.Memory.rooms.E1S1);
        });

        it("should reset colonyInfo.creeps and colonyInfo.spawnQueue", () => {
            colonyData.creeps = { some: "creep" } as any;
            colonyData.spawnQueue = [{ some: "request" }] as any;

            (colonyManager as any).initialSetup();

            assert.deepEqual(colonyData.creeps, {});
            assert.deepEqual(colonyData.spawnQueue, []);
        });
    });
});
