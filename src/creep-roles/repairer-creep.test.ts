import { RepairerCreep } from "./repairer-creep";
import { Game, Memory } from "../../test/utils/mock";
import { assert } from "chai";
import { cloneDeep } from "lodash";
import { CreepRole } from "../prototypes/types";
import { REPAIR_THRESHOLD_DECAY_PREVENTION } from "../constants/repair-constants";

describe("RepairerCreep", () => {
    beforeEach(() => {
        // @ts-expect-error : allow adding Game to global
        global.Game = cloneDeep(Game);
        // @ts-expect-error : allow adding Memory to global
        global.Memory = cloneDeep(Memory);
    });

    it("should switch to working if full", () => {
        const creep = {
            name: "repairer",
            room: { name: "E1S1", find: () => [] },
            pos: { x: 10, y: 10, roomName: "E1S1", getRangeTo: () => 1, findClosestByPath: () => null },
            store: {
                getCapacity: () => 100,
                getFreeCapacity: () => 0,
                [RESOURCE_ENERGY]: 100,
            },
            memory: {
                role: CreepRole.REPAIRER,
                working: false,
            },
            say: () => {},
        } as any;

        const runner = new RepairerCreep(creep);
        runner.run();

        assert.isTrue(creep.memory.working, "Creep should be working when full");
    });

    it("should NOT switch to working if NOT full and NO emergency", () => {
        const creep = {
            name: "repairer",
            room: {
                name: "E1S1",
                find: () => [], // No structures needing repair
                controller: { level: 1 },
            },
            pos: { x: 10, y: 10, roomName: "E1S1", getRangeTo: () => 1, findClosestByPath: () => null },
            store: {
                getCapacity: () => 100,
                getFreeCapacity: () => 50,
                [RESOURCE_ENERGY]: 50,
            },
            memory: {
                role: CreepRole.REPAIRER,
                working: false,
            },
            say: () => {},
        } as any;

        const runner = new RepairerCreep(creep);
        runner.run();

        assert.isFalse(creep.memory.working, "Creep should NOT be working when not full and no emergency");
    });

    it("should switch to working if NOT full but there IS an emergency", () => {
        const road = {
            id: "road1",
            structureType: STRUCTURE_ROAD,
            hits: REPAIR_THRESHOLD_DECAY_PREVENTION - 1,
            hitsMax: 5000,
            pos: { x: 11, y: 11, roomName: "E1S1" },
        };

        const creep = {
            name: "repairer",
            room: {
                name: "E1S1",
                find: (type: number) => {
                    if (type === FIND_STRUCTURES) return [road];
                    return [];
                },
                controller: { level: 1 },
            },
            pos: { x: 10, y: 10, roomName: "E1S1", getRangeTo: () => 1, findClosestByPath: () => null },
            store: {
                getCapacity: () => 100,
                getFreeCapacity: () => 50,
                [RESOURCE_ENERGY]: 50,
            },
            memory: {
                role: CreepRole.REPAIRER,
                working: false,
            },
            say: () => {},
            repair: () => OK,
        } as any;

        const runner = new RepairerCreep(creep);

        // Mock getColony
        const colony = {
            constructionManager: {
                getRepairStats: () => ({ emergencyHits: 100 }),
            },
        } as any;
        runner.setColony(colony);

        runner.run();

        assert.isTrue(creep.memory.working, "Creep should be working when there is an emergency even if not full");
    });

    it("should pick up a road needing maintenance", () => {
        const road = {
            id: "road1",
            structureType: STRUCTURE_ROAD,
            hits: 4000,
            hitsMax: 5000,
            pos: { x: 11, y: 11, roomName: "E1S1" },
        };

        const creep = {
            name: "repairer",
            room: {
                name: "E1S1",
                find: (type: number) => {
                    if (type === FIND_STRUCTURES) return [road];
                    return [];
                },
                controller: { level: 1 },
            },
            pos: { x: 10, y: 10, roomName: "E1S1", getRangeTo: () => 1, findClosestByPath: (arr: any[]) => arr[0] },
            store: {
                getCapacity: () => 100,
                getFreeCapacity: () => 0,
                [RESOURCE_ENERGY]: 100,
            },
            memory: {
                role: CreepRole.REPAIRER,
                working: true,
            },
            say: () => {},
            repair: () => OK,
        } as any;

        const runner = new RepairerCreep(creep);
        runner.run();

        assert.equal(creep.memory.targetId, "road1", "Creep should target the road needing maintenance");
    });
});
