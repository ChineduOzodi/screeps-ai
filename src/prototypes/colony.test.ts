import { assert } from "chai";
import "./colony.extensions";
import "./creep.extensions";
import "./memory.extensions";
import "./room.extensions";
import { Game, Memory } from "../../test/utils/mock";
import { ColonyManagerImpl } from "./colony";

describe("ColonyManager", () => {
    let colonyData: any;
    let colonyManager: ColonyManagerImpl;

    beforeEach(() => {
        // @ts-ignore
        global.Game = _.clone(Game);
        // @ts-ignore
        global.Memory = _.clone(Memory);

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
        };
        // @ts-ignore
        Game.rooms.E1S1 = mockRoom;

        colonyManager = new ColonyManagerImpl(colonyData);
    });

    describe("getPrimaryStorage", () => {
        it("should return undefined when no storage or container exists", () => {
            // @ts-ignore
            Game.rooms.E1S1.storage = undefined;
            colonyData.containerId = undefined;

            const result = colonyManager.getPrimaryStorage();
            assert.isUndefined(result);
        });

        it("should return room.storage if it exists and is active", () => {
            const mockStorage = {
                id: "storage1",
                isActive: () => true,
                store: { getFreeCapacity: () => 1000 },
            };
            // @ts-ignore
            Game.rooms.E1S1.storage = mockStorage;

            const result = colonyManager.getPrimaryStorage();
            assert.equal(result, mockStorage as any);
        });

        it("should return main container if storage is missing/inactive", () => {
            // @ts-ignore
            Game.rooms.E1S1.storage = undefined;

            const mockContainer = {
                id: "container1",
                structureType: "container",
                store: { getFreeCapacity: () => 100 },
            };
            colonyData.containerId = "container1" as any;
            // @ts-ignore
            (global.Game as any).getObjectById = id => {
                if (id === "container1") return mockContainer;
                return null;
            };

            const result = colonyManager.getPrimaryStorage();
            assert.equal(result, mockContainer as any);
        });

        it("should prioritize storage over container", () => {
            const mockStorage = {
                id: "storage1",
                isActive: () => true,
            };
            // @ts-ignore
            Game.rooms.E1S1.storage = mockStorage;

            const mockContainer = {
                id: "container1",
            };
            colonyData.containerId = "container1" as any;

            const result = colonyManager.getPrimaryStorage();
            assert.equal(result, mockStorage as any);
        });

        it("should fallback to container if storage is inactive", () => {
            const mockStorage = {
                id: "storage1",
                isActive: () => false,
            };
            // @ts-ignore
            Game.rooms.E1S1.storage = mockStorage;

            const mockContainer = {
                id: "container1",
            };
            colonyData.containerId = "container1" as any;
            // @ts-ignore
            (global.Game as any).getObjectById = id => {
                if (id === "container1") return mockContainer;
                return null;
            };

            const result = colonyManager.getPrimaryStorage();
            assert.equal(result, mockContainer as any);
        });
    });
});
