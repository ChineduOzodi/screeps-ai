import { assert } from "chai";
import {
    corridorTerrain,
    isServiced,
    key,
    openTerrain,
    reachableFrom,
    terrainWithWalls,
} from "../../test/utils/terrain";
import { CorePlan, CorePlanner } from "./core-planner";
import { Tile, chebyshev } from "./room-grid";

const SPAWN = { x: 25, y: 25 };

function allTiles(plan: CorePlan): Tile[] {
    return CorePlanner.planTiles(plan);
}

describe("CorePlanner", () => {
    it("places the whole core in an open room", () => {
        const plan = CorePlanner.plan({ terrain: openTerrain, anchor: SPAWN, towerCount: 6, labCount: 10 });

        assert.isDefined(plan.storage);
        assert.isDefined(plan.terminal);
        assert.isDefined(plan.link);
        assert.isDefined(plan.factory);
        assert.isDefined(plan.observer);
        assert.equal(plan.towers.length, 6);
        assert.equal(plan.labs.length, 10);

        const tiles = allTiles(plan);
        assert.equal(new Set(tiles.map(key)).size, tiles.length, "core structures must not overlap");
        for (const tile of tiles) {
            assert.isAtLeast(tile.x, 2);
            assert.isAtMost(tile.x, 47);
            assert.notEqual(key(tile), key(SPAWN), "must not build on the spawn");
        }
    });

    it("keeps the terminal and link beside the storage", () => {
        const plan = CorePlanner.plan({ terrain: openTerrain, anchor: SPAWN, towerCount: 6, labCount: 10 });

        assert.isAtMost(chebyshev(plan.link as Tile, plan.storage as Tile), 2);
        assert.isAtMost(chebyshev(plan.terminal as Tile, plan.storage as Tile), 3);
    });

    it("spreads the towers out and keeps them off the spawn's own ring", () => {
        const plan = CorePlanner.plan({ terrain: openTerrain, anchor: SPAWN, towerCount: 6, labCount: 10 });

        for (let i = 0; i < plan.towers.length; i++) {
            assert.isAtLeast(chebyshev(plan.towers[i], SPAWN), 2, "a tower on the spawn ring blocks haulers");
            for (let j = i + 1; j < plan.towers.length; j++) {
                assert.isAtLeast(chebyshev(plan.towers[i], plan.towers[j]), 2, "towers should not clump");
            }
        }
    });

    it("clusters the labs so every one of them can run a reaction", () => {
        const plan = CorePlanner.plan({ terrain: openTerrain, anchor: SPAWN, towerCount: 6, labCount: 10 });

        // The lab manager runs reactions from the two labs with the most neighbours in
        // range 2, so every lab must be within range 2 of both of them.
        const [inputA, inputB] = plan.labs;
        for (const lab of plan.labs) {
            assert.isAtMost(chebyshev(lab, inputA), 2, `lab at ${key(lab)} cannot reach the first input lab`);
            assert.isAtMost(chebyshev(lab, inputB), 2, `lab at ${key(lab)} cannot reach the second input lab`);
        }
        assert.isAtMost(chebyshev(inputA, inputB), 1, "the input labs sit next to each other");
    });

    it("grows the lab cluster around labs that already stand", () => {
        const existingLabs = [
            { x: 30, y: 30 },
            { x: 31, y: 30 },
        ];
        const plan = CorePlanner.plan({
            terrain: openTerrain,
            anchor: SPAWN,
            towerCount: 6,
            labCount: 6,
            existing: { labs: existingLabs, towers: [] },
            obstacles: existingLabs,
        });

        assert.equal(plan.labs.length, 6);
        for (const lab of plan.labs) {
            assert.isAtMost(chebyshev(lab, existingLabs[0]), 2);
            assert.isAtMost(chebyshev(lab, existingLabs[1]), 2);
        }
    });

    it("plans a lab cluster in a room too broken up for a blind spiral", () => {
        // Open pockets only: a spiral outward from the spawn would scatter labs across
        // them and leave most of the cluster out of reaction range.
        const walls = new Set<string>();
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                const inSpawnPocket = x >= 22 && x <= 28 && y >= 22 && y <= 28;
                const inLabPocket = x >= 29 && x <= 34 && y >= 24 && y <= 29;
                if (!inSpawnPocket && !inLabPocket) walls.add(`${x},${y}`);
            }
        }
        const terrain = terrainWithWalls(walls);

        const plan = CorePlanner.plan({ terrain, anchor: SPAWN, towerCount: 2, labCount: 8 });

        assert.isAtLeast(plan.labs.length, 8);
        const [inputA, inputB] = plan.labs;
        for (const lab of plan.labs) {
            assert.isFalse(walls.has(key(lab)), "must not build into a wall");
            assert.isAtMost(chebyshev(lab, inputA), 2);
            assert.isAtMost(chebyshev(lab, inputB), 2);
        }
    });

    it("plans the core where the old fixed spawn offsets are walls", () => {
        // The old planner put storage at +2/0, terminal at -2/0 and towers on the four
        // diagonals and +/-3 on y. Wall every one of those tiles.
        const walls = new Set<string>();
        for (const offset of [
            { x: 2, y: 0 },
            { x: -2, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 2 },
            { x: -2, y: -2 },
            { x: -2, y: 2 },
            { x: 2, y: -2 },
            { x: 0, y: 3 },
            { x: 0, y: -3 },
        ]) {
            walls.add(`${SPAWN.x + offset.x},${SPAWN.y + offset.y}`);
        }
        const terrain = terrainWithWalls(walls);

        const plan = CorePlanner.plan({ terrain, anchor: SPAWN, towerCount: 6, labCount: 10 });

        assert.isDefined(plan.storage, "storage must not depend on one hard-coded tile");
        assert.isDefined(plan.terminal);
        assert.isDefined(plan.link);
        assert.equal(plan.towers.length, 6);
        for (const tile of allTiles(plan)) {
            assert.isFalse(walls.has(key(tile)), "must not build into a wall");
        }
    });

    it("plans a core in a corridor too narrow for the old layout", () => {
        const terrain = corridorTerrain(3);
        const plan = CorePlanner.plan({ terrain, anchor: SPAWN, towerCount: 6, labCount: 10 });

        assert.isDefined(plan.storage);
        assert.isDefined(plan.terminal);
        assert.isNotEmpty(plan.towers);

        const reach = reachableFrom(terrain, SPAWN, allTiles(plan));
        for (const tile of allTiles(plan)) {
            assert.isTrue(isServiced(reach, tile), `no creep can reach the core structure at ${key(tile)}`);
        }
    });

    it("keeps structures that already exist where they are", () => {
        const storage = { x: 27, y: 25 };
        const towers = [{ x: 22, y: 22 }];

        const plan = CorePlanner.plan({
            terrain: openTerrain,
            anchor: SPAWN,
            towerCount: 3,
            labCount: 10,
            existing: { storage, towers },
            obstacles: [storage, ...towers],
        });

        assert.deepEqual(plan.storage, storage);
        assert.include(plan.towers.map(key), key(towers[0]));
        assert.equal(plan.towers.length, 3);
    });

    it("leaves reserved tiles and the spawn's breathing room alone", () => {
        const reserved = { x: 24, y: 24 };
        const plan = CorePlanner.plan({
            terrain: openTerrain,
            anchor: SPAWN,
            towerCount: 6,
            labCount: 10,
            reserved: [reserved],
        });

        const taken = new Set(allTiles(plan).map(key));
        assert.notInclude([...taken], key(reserved));

        let open = 0;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                if (!taken.has(`${SPAWN.x + dx},${SPAWN.y + dy}`)) open++;
            }
        }
        assert.isAtLeast(open, 3);
    });

    it("never seals off a tile it was told to keep reachable", () => {
        const walls = new Set<string>();
        // A pocket around the spawn with one exit tile at 28,25.
        for (let y = 20; y <= 30; y++) {
            for (let x = 20; x <= 35; x++) {
                const inPocket = x <= 27;
                const isDoor = x === 28 && y === 25;
                if (!inPocket && !isDoor) walls.add(`${x},${y}`);
            }
        }
        for (let y = 24; y <= 26; y++) for (let x = 29; x <= 35; x++) walls.delete(`${x},${y}`);
        const terrain = terrainWithWalls(walls);

        const target = { x: 34, y: 25 };
        const plan = CorePlanner.plan({
            terrain,
            anchor: SPAWN,
            towerCount: 6,
            labCount: 10,
            keepReachable: [target],
        });

        assert.notInclude(allTiles(plan).map(key), key({ x: 28, y: 25 }), "the only door must stay open");
        const reach = reachableFrom(terrain, SPAWN, allTiles(plan));
        assert.isTrue(isServiced(reach, target));
    });

    it("returns an empty plan when the spawn is walled in", () => {
        const walls = new Set<string>();
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx !== 0 || dy !== 0) walls.add(`${SPAWN.x + dx},${SPAWN.y + dy}`);
            }
        }
        const plan = CorePlanner.plan({ terrain: terrainWithWalls(walls), anchor: SPAWN, towerCount: 6, labCount: 10 });

        assert.isUndefined(plan.storage);
        assert.isEmpty(plan.towers);
    });
});
