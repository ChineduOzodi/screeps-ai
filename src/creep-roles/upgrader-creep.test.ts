import { ColonyManagerImpl } from "prototypes/colony";
import { ColonyManager, CreepRole } from "prototypes/types";
import { Game, Memory } from "../../test/utils/mock";
import { MAX_UPGRADERS, MAX_UPGRADERS_WITH_SURPLUS, UpgraderCreepSpawner } from "./upgrader-creep";
import { assert } from "chai";
import { loop } from "../main";
import { stub } from "sinon";

describe("upgrader-creep", () => {
    beforeEach(() => {
        // @ts-expect-error : allow adding Game to global
        global.Game = _.clone(Game);
        // @ts-expect-error : allow adding Memory to global
        global.Memory = _.clone(Memory);
        loop();
    });

    describe("maxUpgraders", () => {
        it("lifts the cap only while energy is banked above the reserve", () => {
            assert.equal(UpgraderCreepSpawner.maxUpgraders(0), MAX_UPGRADERS);
            assert.equal(UpgraderCreepSpawner.maxUpgraders(-1), MAX_UPGRADERS);
            assert.equal(UpgraderCreepSpawner.maxUpgraders(1), MAX_UPGRADERS_WITH_SURPLUS);
            assert.isAbove(MAX_UPGRADERS_WITH_SURPLUS, MAX_UPGRADERS);
        });
    });

    describe("UpgraderCreepSpawner", () => {
        function makeColony(energySurplus: number): ColonyManager {
            const colonyInfo: Colony = {
                energyManagement: { energySurplus, sources: [] },
            } as any;
            const colony = new ColonyManagerImpl(colonyInfo);
            const storage = { pos: new RoomPosition(25, 25, "E1S1"), isActive: () => true };
            const mockRoom = {
                energyCapacityAvailable: 1300,
                storage,
                controller: { id: "ctrl", pos: new RoomPosition(20, 20, "E1S1") },
                find: () => [],
            } as any;
            stub(colony, "getMainRoom").returns(mockRoom);
            stub(colony, "getMainSpawn").returns({ room: mockRoom } as any);
            stub(colony, "getPrimaryStorage").returns(storage as any);
            return colony;
        }

        it("keeps the base cap with no surplus even when the budget would allow more", () => {
            const profiles = new UpgraderCreepSpawner().createProfiles(1000, makeColony(0));
            assert.equal(profiles[CreepRole.UPGRADER].desiredAmount, MAX_UPGRADERS);
        });

        it("spawns up to the surplus cap when a large budget is backed by banked energy", () => {
            const profiles = new UpgraderCreepSpawner().createProfiles(1000, makeColony(368000));
            assert.equal(profiles[CreepRole.UPGRADER].desiredAmount, MAX_UPGRADERS_WITH_SURPLUS);
        });

        it("still sizes the count from the budget when the budget is the binding limit", () => {
            const profiles = new UpgraderCreepSpawner().createProfiles(1, makeColony(368000));
            assert.isAtMost(profiles[CreepRole.UPGRADER].desiredAmount || 0, MAX_UPGRADERS);
        });
    });
});
