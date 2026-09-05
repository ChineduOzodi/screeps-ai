import "prototypes/colony.extensions";
import "prototypes/creep.extensions";
import "prototypes/memory.extensions";
import { alertColor, alertLabel, describeRoom, findTrackingColony } from "./room-intel";
import { expect } from "chai";

const ME = "chin24";

function colony(overrides: Partial<Colony> = {}): Colony {
    return {
        id: "W1N1",
        level: 4,
        spawnEnergy: 300,
        creeps: {},
        rooms: {
            W1N1: { name: "W1N1", isMain: true, alertLevel: 0 },
        },
        mainSpawnId: "spawn" as Id<StructureSpawn>,
        spawnQueue: [],
        stats: {},
        nextUpdate: 0,
        ...overrides,
    } as Colony;
}

function remote(name: string, overrides: Partial<RoomData> = {}): RoomData {
    return { name, alertLevel: 0, sourceCount: 2, distance: 60, lastScouted: 900, ...overrides };
}

function fakeRoom(name: string, hostiles: Partial<Creep>[] = [], controller?: Partial<StructureController>): Room {
    return {
        name,
        controller,
        find: (type: number) => {
            if (type === FIND_HOSTILE_CREEPS) return hostiles;
            return [];
        },
    } as any as Room;
}

function hostile(attack: number, heal: number): Partial<Creep> {
    return {
        hits: 1000,
        hitsMax: 1000,
        getActiveBodyparts: (part: BodyPartConstant) => {
            if (part === ATTACK) return attack;
            if (part === HEAL) return heal;
            return 0;
        },
    } as any as Creep;
}

describe("room-intel", () => {
    beforeEach(() => {
        // @ts-ignore
        global.Game = { time: 1000, rooms: {}, spawns: {} };
        // @ts-ignore
        global.Memory = { colonies: {} };
    });

    describe("alert scale", () => {
        it("maps alert levels to labels and colors", () => {
            expect(alertLabel(0)).to.equal("clear");
            expect(alertLabel(1)).to.contain("unarmed");
            expect(alertLabel(2)).to.contain("armed");
            expect(alertLabel(5)).to.contain("critical");
            expect(alertColor(0)).to.equal("#4caf50");
            expect(alertColor(9)).to.equal(alertColor(5));
            expect(alertColor(-1)).to.equal(alertColor(0));
        });
    });

    describe("describeRoom", () => {
        it("reports an actively mined remote", () => {
            const c = colony({
                rooms: { W1N1: { name: "W1N1", isMain: true, alertLevel: 0 }, W2N1: remote("W2N1") },
                energyManagement: {
                    sources: [
                        { sourceId: "a" as Id<Source>, position: { roomName: "W2N1" } as RoomPosition, accessCount: 1 },
                        { sourceId: "b" as Id<Source>, position: { roomName: "W1N1" } as RoomPosition, accessCount: 1 },
                    ],
                } as any,
            });
            const intel = describeRoom(c, "W2N1", undefined, ME);
            expect(intel.plan).to.equal("mining");
            expect(intel.headline).to.equal("mining 1/2");
            expect(intel.alertLevel).to.equal(0);
            expect(intel.lines[0]).to.equal("alert 0: clear");
            expect(intel.lines).to.include("remote mining 1 source(s)");
            expect(intel.lines).to.include("expansion candidate");
        });

        it("explains a remote that is safe but lost its slot to closer rooms", () => {
            const c = colony({
                level: 2,
                rooms: {
                    W1N1: { name: "W1N1", isMain: true, alertLevel: 0 },
                    W2N1: remote("W2N1", { distance: 40 }),
                    W3N1: remote("W3N1", { distance: 90 }),
                },
            });
            const near = describeRoom(c, "W2N1", undefined, ME);
            expect(near.plan).to.equal("mining");
            expect(near.headline).to.equal("mining: pending");

            const far = describeRoom(c, "W3N1", undefined, ME);
            expect(far.plan).to.equal("candidate");
            expect(far.headline).to.equal("reserve #2");
            expect(far.lines).to.include("1 closer room(s) fill the 1 remote slot(s)");
        });

        it("says remote mining is locked before RCL 2", () => {
            const c = colony({
                level: 1,
                rooms: { W1N1: { name: "W1N1", isMain: true, alertLevel: 0 }, W2N1: remote("W2N1") },
            });
            const intel = describeRoom(c, "W2N1", undefined, ME);
            expect(intel.headline).to.equal("waiting: RCL 2");
        });

        it("marks a threatened room as avoided and sizes the response", () => {
            const c = colony({
                rooms: { W1N1: { name: "W1N1", isMain: true, alertLevel: 0 }, W2N1: remote("W2N1", { alertLevel: 3 }) },
            });
            const intel = describeRoom(c, "W2N1", undefined, ME);
            expect(intel.plan).to.equal("avoiding");
            expect(intel.color).to.equal("#f44336");
            expect(intel.lines).to.include("mining paused until the alert clears");
            expect(intel.lines).to.include("expansion blocked by threat");
            expect(intel.lines).to.include("response: 3 defender(s), 1 ranged");
        });

        it("adds live hostile numbers and squad state when we have vision", () => {
            const c = colony({
                rooms: { W1N1: { name: "W1N1", isMain: true, alertLevel: 0 }, W2N1: remote("W2N1", { alertLevel: 2 }) },
            });
            Memory.squads = { W2N1: { engaged: false, updated: 1000 } };
            const room = fakeRoom("W2N1", [hostile(2, 1)]);
            const intel = describeRoom(c, "W2N1", room, ME);
            expect(intel.lines).to.include("1 hostile(s): 60 dmg/t, 12 heal/t");
            expect(intel.lines).to.include("squad: holding at rally");
        });

        it("flags unscouted rooms", () => {
            const c = colony({
                rooms: {
                    W1N1: { name: "W1N1", isMain: true, alertLevel: 0 },
                    W2N1: { name: "W2N1", alertLevel: 0 },
                },
            });
            const intel = describeRoom(c, "W2N1", undefined, ME);
            expect(intel.plan).to.equal("scouting");
            expect(intel.headline).to.equal("unscouted");
            expect(intel.lines).to.include("never scouted, rescout due");
        });

        it("marks a stale scout as due for another visit", () => {
            const c = colony({
                rooms: {
                    W1N1: { name: "W1N1", isMain: true, alertLevel: 0 },
                    W2N1: remote("W2N1", { lastScouted: 100 }),
                },
            });
            expect(describeRoom(c, "W2N1", undefined, ME).lines).to.include("scouted 900t ago");
            Game.time = 1500;
            expect(describeRoom(c, "W2N1", undefined, ME).lines).to.include("scouted 1400t ago, rescout due");
        });

        it("ignores rooms someone else owns or reserves", () => {
            const c = colony({
                rooms: {
                    W1N1: { name: "W1N1", isMain: true, alertLevel: 0 },
                    W2N1: remote("W2N1", { owner: "Rival" }),
                    W3N1: remote("W3N1", { reservation: "Rival" }),
                    W4N1: remote("W4N1", { reservation: ME }),
                },
            });
            expect(describeRoom(c, "W2N1", undefined, ME).headline).to.equal("held by Rival");
            expect(describeRoom(c, "W3N1", undefined, ME).lines).to.include("reserved by Rival: no expansion");
            const ours = describeRoom(c, "W4N1", undefined, ME);
            expect(ours.plan).to.not.equal("ignored");
            expect(ours.lines).to.include("reserved by us");
        });

        it("shows the live reservation timer and whether a reserver is wanted", () => {
            const c = colony({
                rooms: { W1N1: { name: "W1N1", isMain: true, alertLevel: 0 }, W2N1: remote("W2N1") },
            });
            const room = fakeRoom("W2N1", [], { reservation: { username: ME, ticksToEnd: 1200 } } as any);
            const intel = describeRoom(c, "W2N1", room, ME);
            expect(intel.lines).to.include("reserved by us (1200t)");
            expect(intel.lines).to.include("reserver: wanted");
        });

        it("reports the expansion target and its stage", () => {
            const c = colony({
                rooms: { W1N1: { name: "W1N1", isMain: true, alertLevel: 0 }, W2N1: remote("W2N1") },
                expansionManagement: { nextUpdate: 0, expansionTarget: "W2N1" },
            });
            expect(describeRoom(c, "W2N1", undefined, ME).headline).to.equal("claiming");
            const claimed = fakeRoom("W2N1", [], { my: true } as any);
            const intel = describeRoom(c, "W2N1", claimed, ME);
            expect(intel.plan).to.equal("expanding");
            expect(intel.headline).to.equal("founding colony");
        });

        it("explains why a room is not an expansion candidate", () => {
            const c = colony({
                rooms: {
                    W1N1: { name: "W1N1", isMain: true, alertLevel: 0 },
                    W2N1: remote("W2N1", { sourceCount: 1 }),
                    W3N1: remote("W3N1", { distance: 400 }),
                },
            });
            expect(describeRoom(c, "W2N1", undefined, ME).lines).to.include("expansion needs 2 sources, has 1");
            expect(describeRoom(c, "W3N1", undefined, ME).lines).to.include("expansion: too far (400)");
        });
    });

    describe("findTrackingColony", () => {
        it("prefers the colony that mines the room over one that merely remembers it", () => {
            const a = colony({ id: "A", rooms: { X: remote("X") } });
            const b = colony({
                id: "B",
                rooms: { X: remote("X") },
                energyManagement: {
                    sources: [
                        { sourceId: "s" as Id<Source>, position: { roomName: "X" } as RoomPosition, accessCount: 1 },
                    ],
                } as any,
            });
            Memory.colonies = { A: a, B: b };
            expect(findTrackingColony("X")?.id).to.equal("B");
            expect(findTrackingColony("Y")).to.equal(undefined);
        });
    });
});
