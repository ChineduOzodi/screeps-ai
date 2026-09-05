import { expect } from "chai";
import { alertedDefendedRooms, defendedRooms, isDefendedRoom } from "./defense-scope";

function colony(overrides: Partial<Colony> = {}): Colony {
    return {
        id: "E29N12",
        level: 4,
        spawnEnergy: 300,
        creeps: {},
        rooms: {},
        mainSpawnId: "spawn" as Id<StructureSpawn>,
        spawnQueue: [],
        stats: {},
        nextUpdate: 0,
        ...overrides,
    } as Colony;
}

function source(roomName: string): ColonySource {
    return { sourceId: "s" as Id<Source>, position: { roomName } as RoomPosition, accessCount: 1 };
}

describe("defense-scope", () => {
    it("defends the main room, mined rooms and the expansion target only", () => {
        const c = colony({
            energyManagement: { sources: [source("E29N12"), source("E28N12")] } as any,
            expansionManagement: { nextUpdate: 0, expansionTarget: "E28N11" },
        });
        expect(Array.from(defendedRooms(c)).sort()).to.deep.equal(["E28N11", "E28N12", "E29N12"]);
        expect(isDefendedRoom(c, "E30N10")).to.equal(false);
    });

    it("always includes the main room even before any source is recorded", () => {
        expect(isDefendedRoom(colony(), "E29N12")).to.equal(true);
    });

    it("lists alerted rooms that will get a response", () => {
        // The live case: a harmless creep behind a zone wall in a sourceless room we never use.
        const c = colony({
            rooms: {
                E29N12: { name: "E29N12", isMain: true, alertLevel: 0 },
                E28N12: { name: "E28N12", alertLevel: 2 },
                E30N10: { name: "E30N10", alertLevel: 1, sourceCount: 0 },
            },
            energyManagement: { sources: [source("E28N12")] } as any,
        });
        expect(alertedDefendedRooms(c).map(r => r.name)).to.deep.equal(["E28N12"]);
    });
});
