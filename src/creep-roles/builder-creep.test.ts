import { ColonyManagerImpl } from "prototypes/colony";
import { ColonyManager, CreepRole } from "prototypes/types";
import { Game, Memory } from "../../test/utils/mock";
import { BuilderCreep, BuilderCreepSpawner } from "creep-roles/builder-creep";
import { assert } from "chai";
import { loop } from "../main";
import { stub } from "sinon";
import { RAMPART_TOPUP_HITS } from "../constants/repair-constants";

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

    describe("rampart top-up", () => {
        function makeCreep(memory: Partial<CreepMemory>) {
            const creep: any = {
                name: "builder",
                room: { name: "E1S1" },
                pos: { x: 10, y: 10, roomName: "E1S1", getRangeTo: () => 1, findClosestByRange: () => null },
                store: { getCapacity: () => 300, [RESOURCE_ENERGY]: 300 },
                memory: { role: CreepRole.BUILDER, working: true, ...memory },
                say: () => {},
                repaired: [] as any[],
                built: [] as any[],
                repair(target: any) {
                    creep.repaired.push(target);
                    return OK;
                },
                build(target: any) {
                    creep.built.push(target);
                    return OK;
                },
            };
            return creep;
        }

        function roomWithStructuresAt(structures: any[]) {
            (global.Game as any).rooms.E1S1 = { name: "E1S1", lookForAt: () => structures };
        }

        it("remembers a rampart site it is building", () => {
            const site = { id: "site_r", structureType: STRUCTURE_RAMPART, pos: { x: 5, y: 6, roomName: "E1S1" } };
            (global.Game as any).getObjectById = (id: string) => (id === "site_r" ? site : null);
            const creep = makeCreep({ targetId: "site_r" as any });

            new BuilderCreep(creep).runBuilderCreep();

            assert.deepEqual(creep.built, [site]);
            assert.deepEqual(creep.memory.rampartTopUp, { x: 5, y: 6, roomName: "E1S1" });
        });

        it("repairs the finished rampart instead of taking the next site", () => {
            const rampart = { id: "ramp", structureType: STRUCTURE_RAMPART, hits: 1, pos: { x: 5, y: 6 } };
            (global.Game as any).getObjectById = () => null; // the site is gone: it finished
            roomWithStructuresAt([{ structureType: STRUCTURE_ROAD }, rampart]);
            const creep = makeCreep({ targetId: "site_r" as any, rampartTopUp: { x: 5, y: 6, roomName: "E1S1" } });

            new BuilderCreep(creep).runBuilderCreep();

            assert.deepEqual(creep.repaired, [rampart]);
            assert.deepEqual(creep.built, []);
            assert.exists(creep.memory.rampartTopUp, "keeps the job until the rampart is topped up");
        });

        it("forgets the rampart once it is topped up or gone", () => {
            (global.Game as any).getObjectById = () => null;
            roomWithStructuresAt([{ structureType: STRUCTURE_RAMPART, hits: RAMPART_TOPUP_HITS, pos: {} }]);
            const creep = makeCreep({ rampartTopUp: { x: 5, y: 6, roomName: "E1S1" } });

            new BuilderCreep(creep).runBuilderCreep();
            assert.notExists(creep.memory.rampartTopUp);
            assert.deepEqual(creep.repaired, []);

            roomWithStructuresAt([]);
            creep.memory.rampartTopUp = { x: 5, y: 6, roomName: "E1S1" };
            new BuilderCreep(creep).runBuilderCreep();
            assert.notExists(creep.memory.rampartTopUp);
        });
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
