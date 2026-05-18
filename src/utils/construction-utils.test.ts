import { assert } from "chai";
import { ConstructionUtils } from "./construction-utils";

describe("ConstructionUtils", () => {
    describe("calculateRoads", () => {
        it("should prefer planned roads in its cost matrix", () => {
            const startPos = new RoomPosition(25, 25, "W1N1");
            const endPos = new RoomPosition(30, 30, "W1N1");
            const plannedRoads = [new RoomPosition(26, 26, "W1N1")];

            let capturedCallback: any;
            const originalSearch = PathFinder.search;
            // @ts-ignore
            PathFinder.search = (from: any, to: any, options: any) => {
                capturedCallback = options.roomCallback;
                return { path: [], ops: 0, cost: 0, incomplete: false };
            };

            try {
                ConstructionUtils.calculateRoads(startPos, endPos, 0, plannedRoads);

                assert.isDefined(capturedCallback, "roomCallback should be passed to PathFinder.search");

                const costs = capturedCallback("W1N1");
                assert.equal(costs.get(26, 26), 1, "Planned road should have cost 1");
                assert.equal(costs.get(27, 27), 0, "Other tiles should have default cost 0 in CostMatrix");
            } finally {
                // @ts-ignore
                PathFinder.search = originalSearch;
            }
        });

        it("should include existing roads and construction sites in cost matrix", () => {
            const startPos = new RoomPosition(25, 25, "W1N1");
            const endPos = new RoomPosition(30, 30, "W1N1");

            // Mock room with structures
            const mockRoom = {
                find: (type: number) => {
                    if (type === FIND_STRUCTURES) {
                        return [{ structureType: STRUCTURE_ROAD, pos: new RoomPosition(20, 20, "W1N1") }];
                    }
                    if (type === FIND_CONSTRUCTION_SITES) {
                        return [{ structureType: STRUCTURE_ROAD, pos: new RoomPosition(21, 21, "W1N1") }];
                    }
                    return [];
                },
            };
            Game.rooms.W1N1 = mockRoom as any;

            let capturedCallback: any;
            const originalSearch = PathFinder.search;
            // @ts-ignore
            PathFinder.search = (from: any, to: any, options: any) => {
                capturedCallback = options.roomCallback;
                return { path: [], ops: 0, cost: 0, incomplete: false };
            };

            try {
                ConstructionUtils.calculateRoads(startPos, endPos, 0);

                const costs = capturedCallback("W1N1");
                assert.equal(costs.get(20, 20), 1, "Existing road should have cost 1");
                assert.equal(costs.get(21, 21), 1, "Road construction site should have cost 1");
            } finally {
                // @ts-ignore
                PathFinder.search = originalSearch;
                delete Game.rooms.W1N1;
            }
        });
    });
});
