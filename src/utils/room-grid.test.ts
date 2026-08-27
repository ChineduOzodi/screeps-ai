import { assert } from "chai";
import { openTerrain, terrainWithOpen, terrainWithWalls } from "../../test/utils/terrain";
import { RoomGrid, index } from "./room-grid";

const SPAWN = { x: 25, y: 25 };

describe("RoomGrid", () => {
    it("treats the anchor tile as occupied by the spawn", () => {
        const grid = new RoomGrid(openTerrain, SPAWN);

        assert.isFalse(grid.isOpen(index(SPAWN.x, SPAWN.y)));
        assert.isFalse(grid.claim(index(SPAWN.x, SPAWN.y)));
        assert.equal(grid.distanceAt(index(SPAWN.x, SPAWN.y)), -1);
    });

    it("refuses a tile that would cut part of the room off", () => {
        // Two open pockets joined by a single tile.
        const open = new Set<string>();
        for (let y = 20; y <= 30; y++) for (let x = 15; x <= 24; x++) open.add(`${x},${y}`);
        for (let y = 20; y <= 30; y++) for (let x = 26; x <= 35; x++) open.add(`${x},${y}`);
        open.add("25,25");
        const grid = new RoomGrid(terrainWithOpen(open), { x: 20, y: 25 });

        assert.isFalse(grid.claim(index(25, 25)), "the only passage must stay open");
        assert.isTrue(grid.isOpen(index(25, 25)), "a refused claim leaves the grid untouched");
    });

    it("refuses a tile that would wall in something already claimed", () => {
        // A dead end: 24,25 can only ever be reached from 25,25.
        const open = new Set<string>(["24,25", "25,25"]);
        for (let y = 24; y <= 26; y++) for (let x = 26; x <= 30; x++) open.add(`${x},${y}`);
        const grid = new RoomGrid(terrainWithOpen(open), { x: 26, y: 25 });

        assert.isTrue(grid.claim(index(24, 25)), "the dead end can hold a structure");
        assert.isFalse(grid.claim(index(25, 25)), "but then its only approach must stay open");
    });

    it("keeps free tiles around the spawn", () => {
        const grid = new RoomGrid(openTerrain, SPAWN, { anchorBreathingRoom: 3 });

        let claimed = 0;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                if (grid.claim(index(SPAWN.x + dx, SPAWN.y + dy))) claimed++;
            }
        }
        assert.equal(claimed, 5, "3 of the spawn's 8 neighbours stay free");
    });

    it("clamps the breathing room to what the terrain offers", () => {
        // The spawn sits in a two-tile alcove, so 3 free neighbours are impossible.
        const open = new Set<string>(["25,25", "25,24", "25,26", "25,23", "25,27"]);
        const grid = new RoomGrid(terrainWithOpen(open), SPAWN, { anchorBreathingRoom: 3 });

        assert.isTrue(grid.claim(index(25, 23)), "planning must not stall in a tight spawn pocket");
    });

    it("only counts the side of the spawn the base is on", () => {
        // Two pockets that touch the spawn but not each other: the larger one is the base.
        const walls = new Set<string>();
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                const big = x >= 26 && x <= 35 && y >= 20 && y <= 30;
                const small = x === 24 && y >= 24 && y <= 26;
                if (!big && !small && !(x === SPAWN.x && y === SPAWN.y)) walls.add(`${x},${y}`);
            }
        }
        const grid = new RoomGrid(terrainWithWalls(walls), SPAWN);

        assert.isTrue(grid.isReachable(index(30, 25)), "the large pocket is the base");
        assert.isFalse(grid.isReachable(index(24, 25)), "the pocket behind the spawn is not");
        assert.isFalse(grid.claim(index(24, 25)), "and nothing is planned into it");
    });

    it("keeps guarded tiles reachable", () => {
        const open = new Set<string>();
        for (let y = 24; y <= 26; y++) for (let x = 20; x <= 30; x++) open.add(`${x},${y}`);
        const grid = new RoomGrid(terrainWithOpen(open), { x: 22, y: 25 });
        grid.guard([{ x: 30, y: 25 }]);

        // Sealing the 3-tile-wide corridor would strand the guarded tile.
        assert.isTrue(grid.claim(index(26, 24)));
        assert.isTrue(grid.claim(index(26, 26)));
        assert.isFalse(grid.claim(index(26, 25)), "the last tile of the corridor must stay open");
    });
});
