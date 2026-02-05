import { ColonyManager, ColonyManagerImpl } from "prototypes/colony";
import { Game, Memory } from "../../test/utils/mock";
import { BuilderCreepSpawner } from "creep-roles/builder-creep";
import { CreepRole } from "prototypes/creep";
import { assert } from "chai";
import { loop } from "../main";
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

        it("should build min builder", () => {
            const colonyInfo: Colony = {
                builderManagement: {
                    buildQueue: ["site_1"],
                } as any,
            } as any;
            const colony: ColonyManager = new ColonyManagerImpl(colonyInfo);
            const mockRoom = {
                energyCapacityAvailable: SPAWN_ENERGY_CAPACITY,
                storage: {
                    pos: new RoomPosition(25, 25, "E1S1"),
                    isActive: () => true,
                },
            } as any;

            stub(colony, "getMainSpawn").callsFake(() => {
                const spawn: StructureSpawn = {
                    room: mockRoom,
                } as any;
                return spawn;
            });
            stub(colony, "getMainRoom").returns(mockRoom);
            stub(colony, "getTotalEstimatedEnergyFlowRate").returns(0);

            // Mock Game.getObjectById for construction site
            const originalGetObjectById = (global.Game as any).getObjectById;
            (global.Game as any).getObjectById = (id: string) => {
                if (id === "site_1") {
                    return {
                        id: "site_1",
                        pos: new RoomPosition(10, 10, "E1S1"),
                    } as any;
                }
                return null;
            };

            const profiles = spawner.createProfiles(10, colony);

            // Restore Game mock (though test environment resets it usually, best practice to not leak)
            (global.Game as any).getObjectById = originalGetObjectById; // Note: original mock might be different in this setup

            assert.exists(profiles[CreepRole.BUILDER]);
            assert.equal(profiles[CreepRole.BUILDER].desiredAmount, 2);
        });
    });
});
