import { assert } from "chai";
import { Game, Memory } from "../../test/utils/mock";
import { createFakeRoom } from "../../test/utils/fakes";
import { loop } from "../main";
import { RoomExtras } from "./room";
import { RAMPART_TOPUP_HITS } from "../constants/repair-constants";

function tower(energy: number, capacity = 1000): StructureTower & { repaired: any[] } {
    const t: any = {
        structureType: STRUCTURE_TOWER,
        store: { [RESOURCE_ENERGY]: energy, getCapacity: () => capacity },
        repaired: [],
        repair(target: any) {
            t.repaired.push(target);
            return OK;
        },
        heal: () => OK,
        attack: () => OK,
        pos: { findInRange: () => [], findClosestByRange: () => null },
    };
    return t;
}

function rampart(id: string, hits: number) {
    return { id, structureType: STRUCTURE_RAMPART, hits, hitsMax: 300000, pos: { x: 1, y: 1 } };
}

describe("Room Prototype", () => {
    beforeEach(() => {
        // @ts-ignore : allow adding Game to global
        global.Game = _.clone(Game);
        // @ts-ignore : allow adding Memory to global
        global.Memory = _.clone(Memory);
        loop();
    });

    it("should exist", () => {
        const room = createFakeRoom("E1S1");
        assert.isDefined(room);
    });

    describe("topUpRamparts", () => {
        function roomWith(structures: any[]): Room {
            return {
                name: "E1S1",
                find: (type: number, opts?: { filter: (s: any) => boolean }) => {
                    if (type !== FIND_MY_STRUCTURES) return [];
                    return opts?.filter ? structures.filter(opts.filter) : structures;
                },
            } as any as Room;
        }

        it("repairs the weakest rampart below the top-up threshold", () => {
            const weak = rampart("weak", 1);
            const fine = rampart("fine", RAMPART_TOPUP_HITS);
            const mid = rampart("mid", 2000);
            const t = tower(1000);

            new RoomExtras(roomWith([fine, mid, weak])).topUpRamparts([t]);

            assert.deepEqual(t.repaired, [weak]);
        });

        it("spreads several towers over the weakest ramparts", () => {
            const a = rampart("a", 10);
            const b = rampart("b", 20);
            const t1 = tower(1000);
            const t2 = tower(1000);
            const t3 = tower(1000);

            new RoomExtras(roomWith([b, a])).topUpRamparts([t1, t2, t3]);

            assert.deepEqual(t1.repaired, [a]);
            assert.deepEqual(t2.repaired, [b]);
            assert.deepEqual(t3.repaired, [a]);
        });

        it("keeps a low tower's energy for defense", () => {
            const t = tower(400);
            new RoomExtras(roomWith([rampart("weak", 1)])).topUpRamparts([t]);
            assert.deepEqual(t.repaired, []);
        });

        it("does nothing when every rampart is healthy", () => {
            const t = tower(1000);
            new RoomExtras(roomWith([rampart("ok", RAMPART_TOPUP_HITS + 1)])).topUpRamparts([t]);
            assert.deepEqual(t.repaired, []);
        });
    });
});
