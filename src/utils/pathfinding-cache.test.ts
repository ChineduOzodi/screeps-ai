import { expect } from "chai";
import { PathfindingCache } from "./pathfinding-cache";

describe("PathfindingCache", () => {
    beforeEach(() => {
        // @ts-ignore
        global.Memory = {};
        PathfindingCache.clear();
        // @ts-ignore
        global.Game = {
            time: 1000,
        };
        // @ts-ignore
        global.TOP = 1;
        // @ts-ignore
        global.TOP_RIGHT = 2;
        // @ts-ignore
        global.RIGHT = 3;
        // @ts-ignore
        global.BOTTOM_RIGHT = 4;
        // @ts-ignore
        global.BOTTOM = 5;
        // @ts-ignore
        global.BOTTOM_LEFT = 6;
        // @ts-ignore
        global.LEFT = 7;
        // @ts-ignore
        global.TOP_LEFT = 8;
    });

    it("should store and retrieve a path", () => {
        const from = new RoomPosition(10, 10, "W1N1");
        const to = new RoomPosition(20, 20, "W1N1");
        const path: RoomPosition[] = [new RoomPosition(11, 11, "W1N1")];

        PathfindingCache.setPath(from, to, 0, path);
        const retrieved = PathfindingCache.getPath(from, to, 0);

        expect(retrieved).to.deep.equal(path);
    });

    it("should return undefined for expired paths", () => {
        const from = new RoomPosition(10, 10, "W1N1");
        const to = new RoomPosition(20, 20, "W1N1");
        const path: RoomPosition[] = [new RoomPosition(11, 11, "W1N1")];

        PathfindingCache.setPath(from, to, 0, path);

        // @ts-ignore
        global.Game.time = 3000; // TTL is 1000

        const retrieved = PathfindingCache.getPath(from, to, 0);
        expect(retrieved).to.equal(undefined);
    });

    it("should return a reversed path", () => {
        const from = new RoomPosition(10, 10, "W1N1");
        const to = new RoomPosition(12, 12, "W1N1");

        // Path: (10,10) -> (11,11) -> (12,12)
        const path: RoomPosition[] = [new RoomPosition(11, 11, "W1N1"), new RoomPosition(12, 12, "W1N1")];

        PathfindingCache.setPath(from, to, 0, path);

        // Retrieve reverse path: (12,12) -> (10,10)
        const reversed = PathfindingCache.getPath(to, from, 0);

        expect(reversed).to.not.equal(undefined);
        expect(reversed!.length).to.equal(2);

        // Reversed path should contain positions in reverse order
        expect(reversed![0].x).to.equal(11);
        expect(reversed![0].y).to.equal(11);
        expect(reversed![1].x).to.equal(10);
        expect(reversed![1].y).to.equal(10);
    });
    describe("getStandardCostMatrix", () => {
        const site = (structureType: string, x: number, y: number, my = true) => ({
            structureType,
            my,
            pos: new RoomPosition(x, y, "W1N1"),
        });

        const mockRoom = (sites: any[]) => {
            // @ts-ignore
            global.Game.rooms = {
                W1N1: {
                    find: (type: number) => (type === FIND_CONSTRUCTION_SITES ? sites : []),
                } as any,
            };
        };

        it("should keep our own container sites walkable so mining seats stay reachable", () => {
            mockRoom([site(STRUCTURE_CONTAINER, 10, 10)]);

            const costs = PathfindingCache.getStandardCostMatrix("W1N1");

            expect(costs.get(10, 10)).to.equal(0);
        });

        it("should make our own obstacle sites expensive but still passable", () => {
            mockRoom([site(STRUCTURE_EXTENSION, 11, 11)]);

            const costs = PathfindingCache.getStandardCostMatrix("W1N1");

            expect(costs.get(11, 11)).to.equal(20);
        });

        it("should treat hostile construction sites as impassable", () => {
            mockRoom([site(STRUCTURE_EXTENSION, 12, 12, false)]);

            const costs = PathfindingCache.getStandardCostMatrix("W1N1");

            expect(costs.get(12, 12)).to.equal(0xff);
        });
    });
});
