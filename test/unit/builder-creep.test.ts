import { ColonyManager, ColonyManagerImpl } from "prototypes/colony";
import { Game, Memory } from "./mock";
import { BuilderCreepSpawner } from "creep-roles/builder-creep";
import { CreepRole } from "prototypes/creep";
import { assert } from "chai";
import { loop } from "../../src/main";
import { stub } from "sinon";

describe("builder-creep", () => {
    before(() => {
        // runs before all test in this block
    });

    beforeEach(() => {
        // runs before each test in this block
        // @ts-expect-error : allow adding Game to global
        global.Game = _.clone(Game);
        // @ts-expect-error : allow adding Memory to global
        global.Memory = _.clone(Memory);
        loop();
        const test = WORK;
        console.log(test);
    });

    describe("BuilderCreepSpawner", () => {
        let spawner: BuilderCreepSpawner;

        beforeEach(() => {
            spawner = new BuilderCreepSpawner();
        });

        it.only("should build min builder", () => {
            const colonyInfo: Colony = {} as any;
            const colony: ColonyManager = new ColonyManagerImpl(colonyInfo);
            stub(colony, "getMainSpawn").callsFake(() => {
                const spawn: StructureSpawn = {
                    room: {
                        energyCapacityAvailable: SPAWN_ENERGY_CAPACITY,
                    } as any,
                } as any;
                return spawn;
            });
            stub(colony, "getTotalEstimatedEnergyFlowRate").returns(0);

            const profiles = spawner.createProfiles(1, colony);
            assert.exists(profiles[CreepRole.BUILDER]);
            assert.equal(profiles[CreepRole.BUILDER].desiredAmount, 1);
        });
    });
});
