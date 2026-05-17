import { assert } from "chai";
import { stub, match } from "sinon";
import { ExtensionFillerCreep, ExtensionFillerCreepSpawner } from "./extension-filler-creep";
import { ColonyManager, CreepRole } from "prototypes/types";
import { Game, Memory } from "../../test/utils/mock";

describe("ExtensionFillerCreep", () => {
    beforeEach(() => {
        // @ts-expect-error : allow adding Game to global
        global.Game = _.cloneDeep(Game);
        // @ts-expect-error : allow adding Memory to global
        global.Memory = _.cloneDeep(Memory);
    });

    describe("ExtensionFillerCreepSpawner", () => {
        let spawner: ExtensionFillerCreepSpawner;
        let mockColony: any;
        let mockRoom: any;

        beforeEach(() => {
            spawner = new ExtensionFillerCreepSpawner();
            mockRoom = {
                name: "W1N1",
                energyCapacityAvailable: 1000,
                storage: undefined,
            };
            mockColony = {
                getMainRoom: stub().returns(mockRoom),
            };
        });

        it("should return empty if storage does not exist", () => {
            const profiles = spawner.onCreateProfiles(1, mockColony);
            assert.deepEqual(profiles, {});
        });

        it("should return empty if storage is not active", () => {
            mockRoom.storage = {
                isActive: stub().returns(false),
            };
            const profiles = spawner.onCreateProfiles(1, mockColony);
            assert.deepEqual(profiles, {});
        });

        it("should return profile if storage exists and is active", () => {
            mockRoom.storage = {
                isActive: stub().returns(true),
            };
            const profiles = spawner.onCreateProfiles(1, mockColony);
            assert.property(profiles, CreepRole.EXTENSION_FILLER);
            assert.equal(profiles[CreepRole.EXTENSION_FILLER].desiredAmount, 1);
        });
    });

    describe("ExtensionFillerCreep Behavior", () => {
        let creep: any;
        let runner: ExtensionFillerCreep;
        let mockColony: any;

        beforeEach(() => {
            creep = {
                name: "filler",
                memory: { working: false },
                store: {
                    getFreeCapacity: stub().returns(50),
                    getCapacity: stub().returns(50),
                    [RESOURCE_ENERGY]: 0,
                },
                pos: {
                    findClosestByPath: stub(),
                    inRangeTo: stub(),
                },
                withdraw: stub(),
                transfer: stub(),
                move: stub(),
                say: stub(),
            };
            runner = new ExtensionFillerCreep(creep);
            mockColony = {
                getPrimaryStorage: stub(),
            };
            runner.setColony(mockColony);
        });

        it("should transition to working when full", () => {
            creep.store[RESOURCE_ENERGY] = 50;
            creep.store.getFreeCapacity.returns(0);
            creep.memory.working = false;

            runner.onRun();

            assert.isTrue(creep.memory.working);
        });

        it("should transition to gathering when empty", () => {
            creep.store[RESOURCE_ENERGY] = 0;
            creep.memory.working = true;

            runner.onRun();

            assert.isFalse(creep.memory.working);
        });

        it("should gather energy from storage", () => {
            const mockStorage = {
                structureType: STRUCTURE_STORAGE,
                store: { [RESOURCE_ENERGY]: 1000 },
                pos: { x: 10, y: 10 },
            };
            mockColony.getPrimaryStorage.returns(mockStorage);
            creep.withdraw.returns(OK);

            runner.onRun(); // memory.working is false

            assert.isTrue(creep.withdraw.calledWith(mockStorage, RESOURCE_ENERGY));
        });

        it("should deliver energy to Spawns/Extensions first", () => {
            creep.memory.working = true;
            creep.store[RESOURCE_ENERGY] = 50;
            const mockSpawn = {
                structureType: STRUCTURE_SPAWN,
                store: { getFreeCapacity: stub().returns(100) },
            };
            creep.pos.findClosestByPath.onFirstCall().returns(mockSpawn);
            creep.transfer.returns(OK);

            runner.onRun();

            assert.isTrue(creep.transfer.calledWith(mockSpawn, RESOURCE_ENERGY));
            assert.isTrue(creep.pos.findClosestByPath.calledWith(FIND_STRUCTURES, match.any));
        });

        it("should deliver energy to Towers if Spawns/Extensions are full", () => {
            creep.memory.working = true;
            creep.store[RESOURCE_ENERGY] = 50;

            // First call for Spawns/Extensions returns null
            creep.pos.findClosestByPath.onFirstCall().returns(null);

            const mockTower = {
                structureType: STRUCTURE_TOWER,
                store: { getFreeCapacity: stub().returns(100) },
            };
            // Second call for Towers returns mockTower
            creep.pos.findClosestByPath.onSecondCall().returns(mockTower);
            creep.transfer.returns(OK);

            runner.onRun();

            assert.isTrue(creep.transfer.calledWith(mockTower, RESOURCE_ENERGY));
        });
    });
});
