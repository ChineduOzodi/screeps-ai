import { assert } from "chai";
import sinon from "sinon";
import { CreepRole } from "../prototypes/creep";
import { Spawning } from "./spawning";
import { ColonyManager } from "../prototypes/colony";

// define types locally if needed or use 'any' for mocks to avoid deep type issues
// We just need to ensure the structure matches what Spawning expects

describe("Spawning", () => {
    let colony: any;
    let spawning: Spawning;
    let spawn: any;

    beforeEach(() => {
        spawn = {
            spawnCreep: sinon.stub().returns(OK),
            spawning: null,
            room: {
                energyAvailable: 0,
                energyCapacityAvailable: 0,
            },
        };

        colony = {
            getSystemsList: sinon.stub().returns([]),
            getSpawnQueue: sinon.stub().returns([]),
            getMainSpawn: sinon.stub().returns(spawn),
            getCreepData: sinon.stub().returns({ name: "creep1", status: "working" }),
            addToSpawnCreepQueue: sinon.stub(),
            getCreepCount: sinon.stub().returns(0),
            getCreeps: sinon.stub().returns([]),
            systems: {
                energy: {
                    noEnergyCollectors: sinon.stub().returns(false),
                },
            },
            colonyInfo: {
                id: "colony1",
            },
        };

        spawning = new Spawning(colony);
    });

    it("should count creeps by role if no workTargetId is specified in profile", () => {
        const profile = {
            desiredAmount: 1,
            bodyBlueprint: [WORK, CARRY, MOVE],
            memoryBlueprint: {
                role: CreepRole.HARVESTER,
                averageEnergyConsumptionProductionPerTick: 10,
            },
        };

        colony.getCreepCount.withArgs(CreepRole.HARVESTER).returns(0);

        (spawning as any).manageSpawnProfile(profile);

        assert.isTrue(colony.addToSpawnCreepQueue.calledOnce, "Should call addToSpawnCreepQueue");
    });

    it("should count creeps with specific workTargetId if specified in profile", () => {
        const profile = {
            desiredAmount: 1,
            bodyBlueprint: [WORK, CARRY, MOVE],
            memoryBlueprint: {
                role: CreepRole.HARVESTER,
                workTargetId: "source2",
                averageEnergyConsumptionProductionPerTick: 10,
            },
        };

        // Existing creep has source1
        colony.getCreeps.returns([{ memory: { role: CreepRole.HARVESTER, workTargetId: "source1" } }]);
        colony.getSpawnQueue.returns([]);

        (spawning as any).manageSpawnProfile(profile);

        assert.isTrue(
            colony.addToSpawnCreepQueue.calledOnce,
            "Should spawn for source2 as source1 creep doesn't count",
        );
    });

    it("should NOT spawn if creep with specific workTargetId already exists", () => {
        const profile = {
            desiredAmount: 1,
            bodyBlueprint: [WORK, CARRY, MOVE],
            memoryBlueprint: {
                role: CreepRole.HARVESTER,
                workTargetId: "source1",
                averageEnergyConsumptionProductionPerTick: 10,
            },
        };

        // Existing creep has source1
        colony.getCreeps.returns([{ memory: { role: CreepRole.HARVESTER, workTargetId: "source1" } }]);
        colony.getSpawnQueue.returns([]);

        (spawning as any).manageSpawnProfile(profile);

        assert.isFalse(colony.addToSpawnCreepQueue.called, "Should not spawn if creep exists");
    });

    it("should count creeps in spawn queue as well for workTargetId", () => {
        const profile = {
            desiredAmount: 1,
            bodyBlueprint: [WORK, CARRY, MOVE],
            memoryBlueprint: {
                role: CreepRole.HARVESTER,
                workTargetId: "source1",
                averageEnergyConsumptionProductionPerTick: 10,
            },
        };

        colony.getCreeps.returns([]);
        // Spawn queue has a creep for source1
        colony.getSpawnQueue.returns([{ memory: { role: CreepRole.HARVESTER, workTargetId: "source1" } }]);

        (spawning as any).manageSpawnProfile(profile);

        assert.isFalse(colony.addToSpawnCreepQueue.called, "Should count spawn queue");
    });
});
