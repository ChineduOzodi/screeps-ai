import { expect } from "chai";
import { PerimeterPlanner, PerimeterTile } from "./perimeter-planner";
import { key, openTerrain, terrainWithOpen, terrainWithWalls } from "../../test/utils/terrain";
import { TerrainLike } from "./min-cut";
import { Tile } from "./room-grid";

/** Flood from the exits over everything the plan and the blockers leave open. */
function exitsReach(terrain: TerrainLike, blocked: Set<string>, target: Tile): boolean {
    const seen = new Set<string>();
    const queue: Tile[] = [];
    for (let i = 0; i < 50; i++) {
        for (const t of [
            { x: i, y: 0 },
            { x: i, y: 49 },
            { x: 0, y: i },
            { x: 49, y: i },
        ]) {
            const k = key(t);
            if (terrain.get(t.x, t.y) === 0 && !blocked.has(k) && !seen.has(k)) {
                seen.add(k);
                queue.push(t);
            }
        }
    }
    while (queue.length > 0) {
        const t = queue.pop() as Tile;
        if (t.x === target.x && t.y === target.y) return true;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const n = { x: t.x + dx, y: t.y + dy };
                if (n.x < 0 || n.x > 49 || n.y < 0 || n.y > 49) continue;
                const k = key(n);
                if (seen.has(k) || blocked.has(k) || terrain.get(n.x, n.y) !== 0) continue;
                seen.add(k);
                queue.push(n);
            }
        }
    }
    return false;
}

/** A vertical corridor `width` wide centred on x=25 that reaches both the top and bottom exits. */
function corridorTerrain(width: number): TerrainLike {
    const open = new Set<string>();
    const half = Math.floor(width / 2);
    for (let y = 0; y < 50; y++) {
        for (let x = 25 - half; x <= 25 - half + width - 1; x++) open.add(`${x},${y}`);
    }
    return terrainWithOpen(open);
}

function ramparts(plan: PerimeterTile[]): PerimeterTile[] {
    return plan.filter(t => t.structureType === "rampart");
}

describe("PerimeterPlanner", () => {
    const core: Tile[] = [
        { x: 24, y: 24 },
        { x: 26, y: 26 },
    ];

    it("should seal the core with walls plus a rampart gate per run", () => {
        const plan = PerimeterPlanner.plan({ terrain: openTerrain, protect: core });
        expect(plan.length).to.be.greaterThan(0);

        const blocked = new Set(plan.map(key));
        expect(exitsReach(openTerrain, blocked, core[0])).to.equal(false);

        // Walls do the bulk of the work; every run gets a short gate.
        const runs = PerimeterPlanner.connectedRuns(plan);
        for (const run of runs) {
            const gate = run.filter(t => (t as PerimeterTile).structureType === "rampart");
            expect(gate.length).to.be.within(1, 3);
        }
        expect(ramparts(plan).length).to.be.lessThan(plan.length);

        // With the gates open, our own creeps can still get out.
        const wallsOnly = new Set(plan.filter(t => t.structureType === "constructedWall").map(key));
        expect(exitsReach(openTerrain, wallsOnly, core[0])).to.equal(true);
    });

    it("should reuse existing walls instead of ramparting behind them", () => {
        // A 5-wide corridor with the core in the middle and an old wall sealing the north end.
        const terrain = corridorTerrain(5);
        const protect: Tile[] = [{ x: 25, y: 25 }];
        const oldWall: Tile[] = [];
        for (let x = 23; x <= 27; x++) oldWall.push({ x, y: 12 });

        const plan = PerimeterPlanner.plan({ terrain, protect, blockers: oldWall });
        expect(plan.length).to.be.greaterThan(0);
        expect(plan.every(t => t.y > 25)).to.equal(true, "nothing planned on the side the old wall already seals");

        const blocked = new Set([...plan.map(key), ...oldWall.map(key)]);
        expect(exitsReach(terrain, blocked, protect[0])).to.equal(false);
    });

    it("should plan nothing when existing walls already seal the core", () => {
        const terrain = corridorTerrain(5);
        const blockers: Tile[] = [];
        for (let x = 23; x <= 27; x++) {
            blockers.push({ x, y: 12 });
            blockers.push({ x, y: 38 });
        }
        const plan = PerimeterPlanner.plan({ terrain, protect: [{ x: 25, y: 25 }], blockers });
        expect(plan).to.deep.equal([]);
    });

    it("should put the gate on a road crossing the line and never wall a road", () => {
        const terrain = corridorTerrain(5);
        const protect: Tile[] = [{ x: 25, y: 25 }];
        const road: Tile[] = [];
        for (let y = 0; y < 50; y++) road.push({ x: 23, y });

        const plan = PerimeterPlanner.plan({ terrain, protect, passable: road });
        const roadKeys = new Set(road.map(key));
        for (const t of plan) {
            if (roadKeys.has(key(t))) expect(t.structureType).to.equal("rampart");
        }
        // Each run's gate sits on the road, so a run has at most 3 ramparts.
        for (const run of PerimeterPlanner.connectedRuns(plan)) {
            const gate = run.filter(t => (t as PerimeterTile).structureType === "rampart");
            expect(gate.length).to.be.within(1, 3);
            expect(gate.some(t => roadKeys.has(key(t)))).to.equal(true);
        }
    });

    it("should exploit terrain walls like the plain cut does", () => {
        const walls = new Set<string>();
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                if (y === 15 && x !== 25) walls.add(`${x},${y}`);
                if (y === 35 && x !== 25) walls.add(`${x},${y}`);
                if (x === 15 && y > 15 && y < 35) walls.add(`${x},${y}`);
                if (x === 35 && y > 15 && y < 35) walls.add(`${x},${y}`);
            }
        }
        const terrain = terrainWithWalls(walls);
        const plan = PerimeterPlanner.plan({ terrain, protect: core });
        expect(plan.length).to.equal(2);
        expect(plan.every(t => t.structureType === "rampart")).to.equal(true);
    });

    it("should list gates before walls so creeps keep a way out while building", () => {
        const plan = PerimeterPlanner.plan({ terrain: openTerrain, protect: core });
        const firstWall = plan.findIndex(t => t.structureType === "constructedWall");
        const lastRampart = plan.map(t => t.structureType).lastIndexOf("rampart");
        expect(lastRampart).to.be.lessThan(firstWall);
    });
});
