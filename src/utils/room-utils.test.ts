import { expect } from "chai";
import { RoomUtils } from "./room-utils";

describe("RoomUtils", () => {
    beforeEach(() => {
        // Reset globals
        (global as any).Game = {
            map: {
                describeExits: () => ({}),
            },
            rooms: {},
            time: 1000,
        };
    });

    describe("getRoomsNeedingScout", () => {
        it("should return adjacent rooms if they have no data in colony memory", () => {
            const mockColony = {
                getMainRoom: () => ({ name: "W1N1" }),
                colonyInfo: {
                    rooms: {
                        W1N1: { name: "W1N1", isMain: true, lastScouted: 1000 },
                    },
                },
            } as any;

            (global as any).Game.map.describeExits = () => ({ "1": "W1N2", "3": "W2N1" });

            const needing = RoomUtils.getRoomsNeedingScout(mockColony);
            expect(needing).to.include.members(["W1N2", "W2N1"]);
        });

        it("should return rooms that haven't been scouted in over 1000 ticks", () => {
            const mockColony = {
                getMainRoom: () => ({ name: "W1N1" }),
                colonyInfo: {
                    rooms: {
                        W1N2: { name: "W1N2", lastScouted: 100 },
                    },
                },
            } as any;

            (global as any).Game.time = 1200;
            (global as any).Game.map.describeExits = () => ({ "1": "W1N2" });

            const needing = RoomUtils.getRoomsNeedingScout(mockColony);
            expect(needing).to.include("W1N2");
        });

        it("should not return rooms that were scouted recently", () => {
            const mockColony = {
                getMainRoom: () => ({ name: "W1N1" }),
                colonyInfo: {
                    rooms: {
                        W1N2: { name: "W1N2", lastScouted: 1150 },
                    },
                },
            } as any;

            (global as any).Game.time = 1200;
            (global as any).Game.map.describeExits = () => ({ "1": "W1N2" });
            (global as any).Game.rooms.W1N2 = {}; // Simulating vision

            const needing = RoomUtils.getRoomsNeedingScout(mockColony);
            expect(needing).to.not.include("W1N2");
        });
    });

    describe("findBestRoomToScout", () => {
        it("should return the room with the oldest lastScouted time", () => {
            const mockColony = {
                getMainRoom: () => ({ name: "W1N1" }),
                colonyInfo: {
                    rooms: {
                        W1N2: { name: "W1N2", lastScouted: 500 },
                        W2N1: { name: "W2N1", lastScouted: 100 },
                    },
                },
            } as any;

            (global as any).Game.time = 2000;
            (global as any).Game.map.describeExits = () => ({ "1": "W1N2", "3": "W2N1" });

            const best = RoomUtils.findBestRoomToScout(mockColony);
            expect(best).to.equal("W2N1");
        });
    });
});
