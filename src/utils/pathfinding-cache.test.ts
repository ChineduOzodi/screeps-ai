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
        const from = { x: 10, y: 10, roomName: "W1N1" } as RoomPosition;
        const to = { x: 20, y: 20, roomName: "W1N1" } as RoomPosition;
        const path: PathStep[] = [{ x: 11, y: 11, dx: 1, dy: 1, direction: 4 }];

        PathfindingCache.setPath(from, to, 0, path);
        const retrieved = PathfindingCache.getPath(from, to, 0);

        expect(retrieved).to.deep.equal(path);
    });

    it("should return undefined for expired paths", () => {
        const from = { x: 10, y: 10, roomName: "W1N1" } as RoomPosition;
        const to = { x: 20, y: 20, roomName: "W1N1" } as RoomPosition;
        const path: PathStep[] = [{ x: 11, y: 11, dx: 1, dy: 1, direction: 4 }];

        PathfindingCache.setPath(from, to, 0, path);

        // @ts-ignore
        global.Game.time = 3000; // TTL is 1000

        const retrieved = PathfindingCache.getPath(from, to, 0);
        expect(retrieved).to.equal(undefined);
    });

    it("should return a reversed path", () => {
        const from = { x: 10, y: 10, roomName: "W1N1" } as RoomPosition;
        const to = { x: 12, y: 12, roomName: "W1N1" } as RoomPosition;

        // Path: (10,10) -> (11,11) -> (12,12)
        const path: PathStep[] = [
            { x: 11, y: 11, dx: 1, dy: 1, direction: 4 }, // BOTTOM_RIGHT
            { x: 12, y: 12, dx: 1, dy: 1, direction: 4 }, // BOTTOM_RIGHT
        ];

        PathfindingCache.setPath(from, to, 0, path);

        // Retrieve reverse path: (12,12) -> (10,10)
        const reversed = PathfindingCache.getPath(to, from, 0);

        expect(reversed).to.not.equal(undefined);
        expect(reversed!.length).to.equal(2);

        // First step of reverse: (12,12) -> (11,11)
        expect(reversed![0].x).to.equal(11);
        expect(reversed![0].y).to.equal(11);
        expect(reversed![0].dx).to.equal(-1);
        expect(reversed![0].dy).to.equal(-1);
        expect(reversed![0].direction).to.equal(8); // TOP_LEFT

        // Second step of reverse: (11,11) -> (10,10)
        expect(reversed![1].x).to.equal(10);
        expect(reversed![1].y).to.equal(10);
        expect(reversed![1].dx).to.equal(-1);
        expect(reversed![1].dy).to.equal(-1);
        expect(reversed![1].direction).to.equal(8); // TOP_LEFT
    });
});
