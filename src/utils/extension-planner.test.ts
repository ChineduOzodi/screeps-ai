import { assert } from "chai";
import {
    corridorTerrain,
    isServiced,
    key,
    openTerrain,
    reachableFrom,
    terrainWithOpen,
} from "../../test/utils/terrain";
import { ExtensionPlanner } from "./extension-planner";

describe("ExtensionPlanner", () => {
    it("fills an open room with the requested number of extensions", () => {
        const plan = ExtensionPlanner.plan({ terrain: openTerrain, anchor: { x: 25, y: 25 }, count: 60 });

        assert.equal(plan.extensions.length, 60);
        assert.equal(new Set(plan.extensions.map(key)).size, 60, "tiles must be unique");
        for (const tile of plan.extensions) {
            assert.isAtLeast(tile.x, 2);
            assert.isAtMost(tile.x, 47);
            assert.isAtLeast(tile.y, 2);
            assert.isAtMost(tile.y, 47);
            assert.isFalse(tile.x === 25 && tile.y === 25, "must not build on the spawn");
        }
    });

    it("lays out a checkerboard in an open room so every extension keeps an open side", () => {
        const anchor = { x: 25, y: 25 };
        const plan = ExtensionPlanner.plan({ terrain: openTerrain, anchor, count: 60 });

        const anchorParity = (anchor.x + anchor.y) % 2;
        const onParity = plan.extensions.filter(t => (t.x + t.y) % 2 === anchorParity).length;
        assert.equal(onParity, plan.extensions.length, "an open room has no reason to break parity");

        const reach = reachableFrom(openTerrain, anchor, plan.extensions);
        for (const tile of plan.extensions) {
            assert.isTrue(isServiced(reach, tile), `no creep can reach the extension at ${key(tile)}`);
        }
    });

    it("leaves the spawn room to breathe", () => {
        const anchor = { x: 25, y: 25 };
        const plan = ExtensionPlanner.plan({ terrain: openTerrain, anchor, count: 60 });

        const taken = new Set(plan.extensions.map(key));
        let open = 0;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                if (!taken.has(`${anchor.x + dx},${anchor.y + dy}`)) open++;
            }
        }
        assert.isAtLeast(open, 3, "haulers need more than one way in and out of the spawn");
    });

    it("plans extensions in a cramped room where no 5-tile cluster fits", () => {
        // A 3-wide corridor: the old plus-shaped cluster stamp needs a 5x5 pocket and
        // would place nothing at all here.
        const terrain = corridorTerrain(3);
        const anchor = { x: 25, y: 25 };
        const plan = ExtensionPlanner.plan({ terrain, anchor, count: 30 });

        assert.isAbove(plan.extensions.length, 10);

        const reach = reachableFrom(terrain, anchor, plan.extensions);
        for (const tile of plan.extensions) {
            assert.isTrue(isServiced(reach, tile), `no creep can reach the extension at ${key(tile)}`);
        }
    });

    it("never seals off a tile it was told to keep reachable", () => {
        // Two open pockets joined by a single-tile-wide passage.
        const open = new Set<string>();
        for (let y = 20; y <= 30; y++) for (let x = 15; x <= 24; x++) open.add(`${x},${y}`);
        for (let y = 20; y <= 30; y++) for (let x = 26; x <= 35; x++) open.add(`${x},${y}`);
        open.add("25,25"); // the only link between the two pockets
        const terrain = terrainWithOpen(open);

        const anchor = { x: 20, y: 25 };
        const target = { x: 34, y: 25 };
        const plan = ExtensionPlanner.plan({ terrain, anchor, count: 60, keepReachable: [target] });

        assert.notInclude(plan.extensions.map(key), "25,25", "the passage must stay open");

        const reach = reachableFrom(terrain, anchor, plan.extensions);
        assert.isTrue(isServiced(reach, target), "the far pocket must stay reachable");
    });

    it("leaves obstacles and reserved tiles alone", () => {
        const anchor = { x: 25, y: 25 };
        const obstacle = { x: 26, y: 26 };
        const reserved = { x: 24, y: 24 };

        const plan = ExtensionPlanner.plan({
            terrain: openTerrain,
            anchor,
            count: 60,
            obstacles: [obstacle],
            reserved: [reserved],
        });

        const planned = plan.extensions.map(key);
        assert.notInclude(planned, key(obstacle));
        assert.notInclude(planned, key(reserved));
    });

    it("only suggests walkways that border several extensions", () => {
        const anchor = { x: 25, y: 25 };
        const plan = ExtensionPlanner.plan({ terrain: openTerrain, anchor, count: 40 });
        const extensions = new Set(plan.extensions.map(key));

        assert.isAbove(plan.roads.length, 0);
        for (const road of plan.roads) {
            assert.notInclude(extensions, key(road), "a walkway may not sit on an extension");
            const neighbours = [
                { x: road.x, y: road.y - 1 },
                { x: road.x + 1, y: road.y },
                { x: road.x, y: road.y + 1 },
                { x: road.x - 1, y: road.y },
            ].filter(t => extensions.has(key(t))).length;
            assert.isAtLeast(neighbours, 2);
        }
    });

    it("returns nothing when no extensions are needed", () => {
        const plan = ExtensionPlanner.plan({ terrain: openTerrain, anchor: { x: 25, y: 25 }, count: 0 });
        assert.deepEqual(plan, { extensions: [], roads: [] });
    });

    it("returns nothing when the spawn is walled in", () => {
        const terrain = terrainWithOpen(new Set(["25,25"]));
        const plan = ExtensionPlanner.plan({ terrain, anchor: { x: 25, y: 25 }, count: 10 });
        assert.isEmpty(plan.extensions);
    });
});
