import { assert } from "chai";
import { Game, Memory } from "../../test/utils/mock";
import { loop } from "../main";
import { DefenderCreepSpawner } from "./defender-creep";
import { RangedDefenderCreepSpawner } from "./ranged-defender-creep";
import { HealerCreepSpawner } from "./healer-creep";
import { CreepRole } from "../prototypes/types";

describe("defender spawners", () => {
    beforeEach(() => {
        // @ts-ignore : allow adding Game to global
        global.Game = _.clone(Game);
        // @ts-ignore : allow adding Memory to global
        global.Memory = _.clone(Memory);
        loop();
    });

    function makeColony(roomData: { [name: string]: RoomData }, minedRooms: string[]) {
        const mainRoom = { name: "E29N12", energyCapacityAvailable: 1300, energyAvailable: 1300, find: () => [] };
        return {
            colonyInfo: {
                id: "E29N12",
                rooms: roomData,
                energyManagement: {
                    sources: minedRooms.map(roomName => ({ position: { roomName } })),
                },
            },
            getMainRoom: () => mainRoom,
            getCreepCount: () => 1,
            systems: { energy: { noEnergyCollectors: () => false } },
        } as any;
    }

    const rooms: { [name: string]: RoomData } = {
        E29N12: { name: "E29N12", isMain: true, alertLevel: 0 },
        E28N12: { name: "E28N12", alertLevel: 3 },
        E30N10: { name: "E30N10", alertLevel: 3, sourceCount: 0 },
    };

    it("only sends defenders to rooms the colony uses", () => {
        const colony = makeColony(rooms, ["E28N12"]);
        const profiles = new DefenderCreepSpawner().createProfiles(1300, colony);
        assert.exists(profiles[`${CreepRole.DEFENDER}-E28N12`]);
        assert.notExists(profiles[`${CreepRole.DEFENDER}-E30N10`]);
    });

    it("only sends ranged defenders and healers to rooms the colony uses", () => {
        const colony = makeColony(rooms, ["E28N12"]);
        const ranged = new RangedDefenderCreepSpawner().createProfiles(1300, colony);
        assert.exists(ranged[`${CreepRole.RANGED_DEFENDER}-E28N12`]);
        assert.notExists(ranged[`${CreepRole.RANGED_DEFENDER}-E30N10`]);

        const healers = new HealerCreepSpawner().createProfiles(1300, colony);
        assert.exists(healers[`${CreepRole.HEALER}-E28N12`]);
        assert.notExists(healers[`${CreepRole.HEALER}-E30N10`]);
    });

    it("always answers an alert in the main room", () => {
        const colony = makeColony({ E29N12: { name: "E29N12", isMain: true, alertLevel: 2 } }, []);
        const profiles = new DefenderCreepSpawner().createProfiles(1300, colony);
        assert.exists(profiles[`${CreepRole.DEFENDER}-E29N12`]);
    });
});
