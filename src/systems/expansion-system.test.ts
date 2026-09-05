import { expect } from "chai";
import { Game, Memory } from "../../test/utils/mock";
import { loop } from "../main";
import { ExpansionSystem } from "./expansion-system";
import { EXPANSION_MIN_SURPLUS } from "../constants/expansion-constants";

const ME = "chin24";

function room(name: string, overrides: Partial<RoomData> = {}): RoomData {
    return { name, alertLevel: 0, sourceCount: 2, distance: 80, ...overrides };
}

describe("ExpansionSystem", () => {
    let statuses: { [roomName: string]: string };
    let exits: { [roomName: string]: string[] };

    beforeEach(() => {
        // @ts-ignore : allow adding Game to global
        global.Game = _.clone(Game);
        // @ts-ignore : allow adding Memory to global
        global.Memory = _.clone(Memory);
        loop();

        statuses = {};
        exits = {};
        (global as any).Game.map = {
            getRoomStatus: (name: string) => ({ status: statuses[name] || "normal" }),
            describeExits: (name: string) => {
                const list = exits[name] || [];
                const result: Record<string, string> = {};
                list.forEach((exit, i) => (result[String(i)] = exit));
                return result;
            },
        };
        (global as any).Memory.colonies = {};
    });

    describe("hasEnergyToExpand", () => {
        it("requires a surplus above the reserve rather than a share of a huge store", () => {
            expect(ExpansionSystem.hasEnergyToExpand(undefined)).to.equal(false);
            expect(ExpansionSystem.hasEnergyToExpand({ energySurplus: EXPANSION_MIN_SURPLUS - 1 } as any)).to.equal(
                false,
            );
            expect(ExpansionSystem.hasEnergyToExpand({ energySurplus: EXPANSION_MIN_SURPLUS } as any)).to.equal(true);
            // 388k stored is far more than enough, whatever percentage of a 1M store it is.
            expect(
                ExpansionSystem.hasEnergyToExpand({ energySurplus: 368000, storedEnergyPercent: 0.388 } as any),
            ).to.equal(true);
        });
    });

    describe("rankExpansionCandidates", () => {
        it("applies the basic eligibility rules", () => {
            const rooms = {
                MAIN: room("MAIN", { isMain: true }),
                GOOD: room("GOOD"),
                ONE_SOURCE: room("ONE_SOURCE", { sourceCount: 1 }),
                OWNED: room("OWNED", { owner: "Rival" }),
                THEIRS: room("THEIRS", { reservation: "Rival" }),
                OURS: room("OURS", { reservation: ME, distance: 90 }),
                HOT: room("HOT", { alertLevel: 1 }),
                FAR: room("FAR", { distance: 500 }),
                UNSCOUTED: room("UNSCOUTED", { distance: undefined }),
                COLONY: room("COLONY"),
            };
            (global as any).Memory.colonies = { COLONY: {} };

            const names = ExpansionSystem.rankExpansionCandidates(rooms, "MAIN", ME).map(c => c.name);
            expect(names).to.deep.equal(["GOOD", "OURS"]);
        });

        it("skips rooms outside the colony's respawn or novice zone", () => {
            const rooms = {
                MAIN: room("MAIN", { isMain: true }),
                INSIDE: room("INSIDE"),
                OUTSIDE: room("OUTSIDE", { distance: 60 }),
                CLOSED: room("CLOSED", { distance: 50 }),
            };
            statuses.MAIN = "respawn";
            statuses.INSIDE = "respawn";
            statuses.OUTSIDE = "normal";
            statuses.CLOSED = "closed";

            const names = ExpansionSystem.rankExpansionCandidates(rooms, "MAIN", ME).map(c => c.name);
            expect(names).to.deep.equal(["INSIDE"]);
        });

        it("prefers more sources, then fewer hostile neighbours, then distance", () => {
            const rooms = {
                MAIN: room("MAIN", { isMain: true }),
                NEXT_TO_ENEMY: room("NEXT_TO_ENEMY", { distance: 60 }),
                QUIET: room("QUIET", { distance: 90 }),
                THREE_SOURCES: room("THREE_SOURCES", { sourceCount: 3, distance: 150 }),
                ENEMY: room("ENEMY", { owner: "Rival", controllerLevel: 5, towerCount: 2 }),
            };
            (global as any).Memory.colonies = { MAIN: { rooms } };
            exits.NEXT_TO_ENEMY = ["ENEMY", "MAIN"];
            exits.QUIET = ["MAIN"];

            const ranked = ExpansionSystem.rankExpansionCandidates(rooms, "MAIN", ME);
            expect(ranked.map(c => c.name)).to.deep.equal(["THREE_SOURCES", "QUIET", "NEXT_TO_ENEMY"]);
            expect(ranked[2].hostileNeighbours).to.equal(1);
            expect(ranked[1].hostileNeighbours).to.equal(0);
        });

        it("does not count our own rooms as hostile neighbours", () => {
            const rooms = {
                MAIN: room("MAIN", { isMain: true, owner: ME }),
                A: room("A", { distance: 60 }),
                B: room("B", { distance: 50 }),
            };
            (global as any).Memory.colonies = { MAIN: { rooms } };
            exits.A = ["MAIN"];
            exits.B = ["MAIN"];

            const ranked = ExpansionSystem.rankExpansionCandidates(rooms, "MAIN", ME);
            expect(ranked.map(c => c.name)).to.deep.equal(["B", "A"]);
            expect(ranked.every(c => c.hostileNeighbours === 0)).to.equal(true);
        });
    });
});
