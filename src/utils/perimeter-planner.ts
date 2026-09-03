/* eslint-disable no-bitwise */
/**
 * Perimeter planner: turns a min-cut into a wall line with rampart gates.
 *
 * Min-cut tells us which tiles seal the base off from the exits. Ramparting all of
 * them is wasteful: ramparts decay and every one is an extra repair target, while a
 * constructed wall costs nothing to keep. So each connected run of the cut becomes
 * walls, except for a short gate of ramparts where traffic actually crosses. Walls and
 * ramparts that already exist in the room count as sealed and are reused rather than
 * duplicated, so a previous owner's fortifications shrink the plan instead of being
 * ignored.
 */
import { MinCut, TerrainLike } from "./min-cut";
import { ROOM_SIZE, Tile, index, inRoom } from "./room-grid";

export type PerimeterStructure = "constructedWall" | "rampart";

export interface PerimeterTile extends Tile {
    structureType: PerimeterStructure;
}

export interface PerimeterInput {
    terrain: TerrainLike;
    /** Positions the perimeter must enclose. */
    protect: Tile[];
    /** Existing walls and own ramparts: already impassable to enemies, so reused as-is. */
    blockers?: Tile[];
    /** Tiles that cannot take a wall (roads, containers, other structures). Always ramparted. */
    passable?: Tile[];
    /** Clearance kept around the protected structures. */
    padding?: number;
    /** Longest run of ramparts allowed in one gate. */
    maxGate?: number;
}

const DEFAULT_PADDING = 3;
const DEFAULT_MAX_GATE = 3;
const UNREACHED = -1;
/** Substitute for an unreachable side when every tile in a run is boxed in by other cut tiles. */
const UNREACHED_COST = 10000;

const NEIGHBOURS: Tile[] = [
    { x: -1, y: -1 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 1 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
];

export class PerimeterPlanner {
    /**
     * Plans the perimeter, optionally around an existing controller position too.
     * Returns an empty list when nothing needs building: the area is already sealed or
     * cannot be sealed sensibly.
     */
    public static plan(input: PerimeterInput): PerimeterTile[] {
        const padding = input.padding ?? DEFAULT_PADDING;
        const maxGate = Math.max(1, input.maxGate ?? DEFAULT_MAX_GATE);
        const blocked = PerimeterPlanner.toIndexSet(input.blockers);
        const passable = PerimeterPlanner.toIndexSet(input.passable);

        // Anything already standing counts as terrain wall for the cut.
        const sealed: TerrainLike = {
            get: (x, y) => (blocked.has(index(x, y)) ? TERRAIN_MASK_WALL : input.terrain.get(x, y)),
        };

        const cut = MinCut.computeCut(sealed, MinCut.getProtectedRects(input.protect, padding), TERRAIN_MASK_WALL);
        if (cut.length === 0) return [];

        return PerimeterPlanner.assignTypes(sealed, cut, input.protect, padding, passable, maxGate);
    }

    /** Splits a cut into wall tiles and rampart gates. Exposed for planners that bring their own cut. */
    public static assignTypes(
        terrain: TerrainLike,
        cut: Tile[],
        protect: Tile[],
        padding: number,
        passable: Set<number>,
        maxGate: number,
    ): PerimeterTile[] {
        const cutSet = new Set(cut.map(t => index(t.x, t.y)));
        const isWall = (x: number, y: number) => (terrain.get(x, y) & TERRAIN_MASK_WALL) !== 0;
        const isOpen = (x: number, y: number) => inRoom(x, y) && !isWall(x, y) && !cutSet.has(index(x, y));

        // Distance from the exits (outside the cut) and from the core (inside the cut).
        const exits: Tile[] = [];
        for (let i = 0; i < ROOM_SIZE; i++) {
            for (const t of [
                { x: i, y: 0 },
                { x: i, y: ROOM_SIZE - 1 },
                { x: 0, y: i },
                { x: ROOM_SIZE - 1, y: i },
            ]) {
                if (isOpen(t.x, t.y)) exits.push(t);
            }
        }
        const rects = MinCut.getProtectedRects(protect, padding);
        const core: Tile[] = [];
        for (const r of rects) {
            for (let x = r.x1; x <= r.x2; x++) {
                for (let y = r.y1; y <= r.y2; y++) {
                    if (isOpen(x, y)) core.push({ x, y });
                }
            }
        }
        const distExit = PerimeterPlanner.bfs(exits, isOpen);
        const distCore = PerimeterPlanner.bfs(core, isOpen);

        // How far a creep travels if it crosses the perimeter at this tile.
        const crossingCost = (t: Tile): number => {
            let outside = UNREACHED;
            let inside = UNREACHED;
            for (const n of NEIGHBOURS) {
                const nx = t.x + n.x;
                const ny = t.y + n.y;
                if (!isOpen(nx, ny)) continue;
                const idx = index(nx, ny);
                if (distExit[idx] !== UNREACHED)
                    outside = outside === UNREACHED ? distExit[idx] : Math.min(outside, distExit[idx]);
                if (distCore[idx] !== UNREACHED)
                    inside = inside === UNREACHED ? distCore[idx] : Math.min(inside, distCore[idx]);
            }
            return (
                (outside === UNREACHED ? UNREACHED_COST : outside) + (inside === UNREACHED ? UNREACHED_COST : inside)
            );
        };

        const result: PerimeterTile[] = [];
        for (const run of PerimeterPlanner.connectedRuns(cut)) {
            const ramparts = new Set<number>();
            for (const t of run) {
                if (passable.has(index(t.x, t.y))) ramparts.add(index(t.x, t.y));
            }

            // Gate where the crossing is cheapest; a road there is the strongest hint of real traffic.
            const cost = new Map<number, number>();
            for (const t of run) cost.set(index(t.x, t.y), crossingCost(t));
            const ranked = [...run].sort((a, b) => {
                const ia = index(a.x, a.y);
                const ib = index(b.x, b.y);
                const roadA = passable.has(ia) ? 0 : 1;
                const roadB = passable.has(ib) ? 0 : 1;
                if (roadA !== roadB) return roadA - roadB;
                return (cost.get(ia) as number) - (cost.get(ib) as number);
            });

            const centre = ranked[0];
            ramparts.add(index(centre.x, centre.y));
            for (const t of ranked) {
                if (ramparts.size >= maxGate) break;
                if (Math.max(Math.abs(t.x - centre.x), Math.abs(t.y - centre.y)) === 1) {
                    ramparts.add(index(t.x, t.y));
                }
            }

            for (const t of run) {
                const structureType: PerimeterStructure = ramparts.has(index(t.x, t.y)) ? "rampart" : "constructedWall";
                result.push({ x: t.x, y: t.y, structureType });
            }
        }

        // Gates first: they are what keeps our own creeps moving while the line goes up.
        result.sort((a, b) => {
            if (a.structureType !== b.structureType) return a.structureType === "rampart" ? -1 : 1;
            return index(a.x, a.y) - index(b.x, b.y);
        });
        return result;
    }

    /** Groups tiles into 8-connected components. */
    public static connectedRuns(tiles: Tile[]): Tile[][] {
        const remaining = new Map<number, Tile>();
        for (const t of tiles) remaining.set(index(t.x, t.y), t);

        const runs: Tile[][] = [];
        while (remaining.size > 0) {
            const [startIdx, start] = remaining.entries().next().value as [number, Tile];
            remaining.delete(startIdx);
            const run: Tile[] = [start];
            const queue: Tile[] = [start];
            while (queue.length > 0) {
                const t = queue.pop() as Tile;
                for (const n of NEIGHBOURS) {
                    const idx = index(t.x + n.x, t.y + n.y);
                    const next = remaining.get(idx);
                    if (!next) continue;
                    remaining.delete(idx);
                    run.push(next);
                    queue.push(next);
                }
            }
            runs.push(run);
        }
        return runs;
    }

    private static bfs(sources: Tile[], isOpen: (x: number, y: number) => boolean): Int32Array {
        const dist = new Int32Array(ROOM_SIZE * ROOM_SIZE).fill(UNREACHED);
        const queue: Tile[] = [];
        for (const s of sources) {
            const idx = index(s.x, s.y);
            if (dist[idx] !== UNREACHED) continue;
            dist[idx] = 0;
            queue.push(s);
        }
        let head = 0;
        while (head < queue.length) {
            const t = queue[head++];
            const d = dist[index(t.x, t.y)];
            for (const n of NEIGHBOURS) {
                const nx = t.x + n.x;
                const ny = t.y + n.y;
                if (!isOpen(nx, ny)) continue;
                const idx = index(nx, ny);
                if (dist[idx] !== UNREACHED) continue;
                dist[idx] = d + 1;
                queue.push({ x: nx, y: ny });
            }
        }
        return dist;
    }

    private static toIndexSet(tiles: Tile[] | undefined): Set<number> {
        const set = new Set<number>();
        for (const t of tiles || []) {
            if (inRoom(t.x, t.y)) set.add(index(t.x, t.y));
        }
        return set;
    }
}
