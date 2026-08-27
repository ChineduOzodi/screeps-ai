import { expect } from "chai";
import { MinCut, TerrainLike } from "./min-cut";

const WALL = 1;

/** Terrain where every tile is plains. */
const openTerrain: TerrainLike = { get: () => 0 };

/** Builds terrain from a set of wall positions. */
function terrainWithWalls(walls: Set<string>): TerrainLike {
    return { get: (x: number, y: number) => (walls.has(`${x},${y}`) ? WALL : 0) };
}

/**
 * Property check: with the cut tiles blocked, no exit tile may reach the protected rect.
 */
function verifySeparation(
    terrain: TerrainLike,
    cut: { x: number; y: number }[],
    rect: { x1: number; y1: number; x2: number; y2: number },
): boolean {
    const blocked = new Set(cut.map(c => `${c.x},${c.y}`));
    const seen = new Set<string>();
    const queue: { x: number; y: number }[] = [];

    for (let i = 0; i < 50; i++) {
        for (const [x, y] of [
            [i, 0],
            [i, 49],
            [0, i],
            [49, i],
        ]) {
            if (terrain.get(x, y) === 0 && !blocked.has(`${x},${y}`)) {
                queue.push({ x, y });
                seen.add(`${x},${y}`);
            }
        }
    }

    while (queue.length > 0) {
        const { x, y } = queue.pop() as { x: number; y: number };
        if (x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2) {
            return false; // Reached the protected area
        }
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
                const key = `${nx},${ny}`;
                if (seen.has(key) || blocked.has(key)) continue;
                if (terrain.get(nx, ny) !== 0) continue;
                seen.add(key);
                queue.push({ x: nx, y: ny });
            }
        }
    }
    return true;
}

describe("MinCut", () => {
    it("should produce a cut that seals the protected area in an open room", () => {
        const rect = { x1: 20, y1: 20, x2: 30, y2: 30 };
        const cut = MinCut.computeCut(openTerrain, [rect], WALL);

        expect(cut.length).to.be.greaterThan(0);
        expect(verifySeparation(openTerrain, cut, rect)).to.equal(true);
    });

    it("should keep the cut away from exit tiles", () => {
        const rect = { x1: 20, y1: 20, x2: 30, y2: 30 };
        const cut = MinCut.computeCut(openTerrain, [rect], WALL);

        for (const tile of cut) {
            expect(tile.x).to.be.greaterThan(1);
            expect(tile.x).to.be.lessThan(48);
            expect(tile.y).to.be.greaterThan(1);
            expect(tile.y).to.be.lessThan(48);
        }
    });

    it("should exploit terrain walls to shrink the cut", () => {
        // Wall off everything except a corridor at y=24..26, x<20
        const walls = new Set<string>();
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                const inCorridor = y >= 24 && y <= 26 && x < 20;
                const inBase = x >= 20 && x <= 34 && y >= 15 && y <= 35;
                if (!inCorridor && !inBase && x !== 0 && x !== 49 && y !== 0 && y !== 49) {
                    walls.add(`${x},${y}`);
                }
            }
        }
        // Keep left border open as the only exit; wall the other borders
        for (let i = 0; i < 50; i++) {
            walls.add(`${i},0`);
            walls.add(`${i},49`);
            walls.add(`49,${i}`);
        }
        for (let y = 0; y < 50; y++) {
            if (y < 24 || y > 26) walls.add(`0,${y}`);
        }

        const terrain = terrainWithWalls(walls);
        const rect = { x1: 25, y1: 20, x2: 30, y2: 30 };
        const cut = MinCut.computeCut(terrain, [rect], WALL);

        // The corridor is 3 wide, so the cut should be exactly 3 tiles
        expect(cut.length).to.equal(3);
        expect(verifySeparation(terrain, cut, rect)).to.equal(true);
    });

    it("should return empty when the protected area touches the exit border", () => {
        const rect = { x1: 0, y1: 20, x2: 10, y2: 30 };
        const cut = MinCut.computeCut(openTerrain, [rect], WALL);
        expect(cut).to.deep.equal([]);
    });

    it("should return empty when terrain already seals the area", () => {
        // Full wall ring at x/y = 10..40 borders
        const walls = new Set<string>();
        for (let i = 10; i <= 40; i++) {
            walls.add(`${i},10`);
            walls.add(`${i},40`);
            walls.add(`10,${i}`);
            walls.add(`40,${i}`);
        }
        const terrain = terrainWithWalls(walls);
        const rect = { x1: 20, y1: 20, x2: 30, y2: 30 };
        const cut = MinCut.computeCut(terrain, [rect], WALL);
        expect(cut).to.deep.equal([]);
    });

    describe("getProtectedRects", () => {
        it("should build a padded bounding box clamped away from the border", () => {
            const rects = MinCut.getProtectedRects(
                [
                    { x: 5, y: 25 },
                    { x: 30, y: 30 },
                ],
                4,
            );
            expect(rects).to.deep.equal([{ x1: 3, y1: 21, x2: 34, y2: 34 }]);
        });

        it("should return empty for no positions", () => {
            expect(MinCut.getProtectedRects([], 3)).to.deep.equal([]);
        });
    });
});
