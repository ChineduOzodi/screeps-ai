/**
 * Tile grid used by the base planners.
 *
 * Wraps a room's terrain plus the structures already standing in it, and answers the two
 * questions every planner asks: "how far is this tile from the spawn?" and "can I build
 * here without sealing something off?". Placements are made through `claim`, which rejects
 * anything that would cut the spawn off from a guarded tile.
 */
import { TerrainLike } from "./min-cut";

export interface Tile {
    x: number;
    y: number;
}

export const ROOM_SIZE = 50;
/** Structures may not be built on the outermost two rings of a room. */
export const MIN_BUILD = 2;
export const MAX_BUILD = 47;

/** The 8 neighbours in cyclic order, so the ring can be scanned for gaps. */
export const RING: Tile[] = [
    { x: -1, y: -1 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: 0 },
];

export const ORTHOGONAL: Tile[] = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
];

const DEFAULT_WALL_MASK = 1;
/**
 * Tiles next to a narrow passage need a full room flood fill to prove they are safe to
 * build on. Cap how many we run so planning a maze-like room stays inside a CPU tick.
 */
const DEFAULT_MAX_CONNECTIVITY_CHECKS = 150;

/**
 * Open tiles to leave around the spawn. A spawn with a single free tile still "works" but
 * jams instantly, so planners keep some breathing room - clamped to what the terrain
 * actually offers, since a spawn in an alcove may start with fewer.
 */
const DEFAULT_ANCHOR_BREATHING_ROOM = 3;

export interface RoomGridOptions {
    /** Terrain value that means "wall". Defaults to TERRAIN_MASK_WALL (1). */
    wallMask?: number;
    /** Tiles occupied by existing structures: neither buildable nor walkable. */
    obstacles?: Tile[];
    maxConnectivityChecks?: number;
    /** Open tiles to leave around the anchor. Clamped to how many it starts with. */
    anchorBreathingRoom?: number;
}

export function index(x: number, y: number): number {
    return y * ROOM_SIZE + x;
}

export function inRoom(x: number, y: number): boolean {
    return x >= 0 && x < ROOM_SIZE && y >= 0 && y < ROOM_SIZE;
}

export function toTile(idx: number): Tile {
    return { x: idx % ROOM_SIZE, y: Math.floor(idx / ROOM_SIZE) };
}

export function isBuildable(x: number, y: number): boolean {
    return x >= MIN_BUILD && x <= MAX_BUILD && y >= MIN_BUILD && y <= MAX_BUILD;
}

/** Screeps range: the number of steps between two tiles, diagonals included. */
export function chebyshev(a: Tile, b: Tile): number {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function toIndexSet(tiles: Tile[] | undefined): Set<number> {
    const set = new Set<number>();
    for (const tile of tiles ?? []) {
        if (inRoom(tile.x, tile.y)) set.add(index(tile.x, tile.y));
    }
    return set;
}

function count(reach: Uint8Array): number {
    let total = 0;
    for (let i = 0; i < reach.length; i++) total += reach[i];
    return total;
}

/** True when a creep can stand on the tile, or on one of its 8 neighbours. */
export function isServiced(reach: Uint8Array, idx: number): boolean {
    if (reach[idx]) return true;
    const { x, y } = toTile(idx);
    return RING.some(offset => {
        const nx = x + offset.x;
        const ny = y + offset.y;
        return inRoom(nx, ny) && reach[index(nx, ny)] === 1;
    });
}

export class RoomGrid {
    private readonly blocked: Uint8Array;
    private readonly anchorIdx: number;
    private readonly anchor: Tile;
    private readonly dist: Int16Array;
    /**
     * The tile beside the spawn the whole base is measured from. A creep cannot walk
     * through the spawn, so the tiles around it are only one area if a path joins them.
     */
    private readonly baseSeed: number;
    private readonly maxChecks: number;
    private readonly minAnchorOpen: number;
    private reach: Uint8Array;
    /** How many tiles the anchor can currently walk to; claiming may only cost the tile itself. */
    private reachCount: number;
    private checks = 0;
    /** Tiles that must keep creep access: guarded targets plus everything claimed so far. */
    private guarded = new Set<number>();

    public constructor(terrain: TerrainLike, anchor: Tile, options: RoomGridOptions = {}) {
        const wallMask = options.wallMask ?? DEFAULT_WALL_MASK;
        this.anchor = anchor;
        this.anchorIdx = index(anchor.x, anchor.y);
        this.maxChecks = options.maxConnectivityChecks ?? DEFAULT_MAX_CONNECTIVITY_CHECKS;

        this.blocked = new Uint8Array(ROOM_SIZE * ROOM_SIZE);
        for (let y = 0; y < ROOM_SIZE; y++) {
            for (let x = 0; x < ROOM_SIZE; x++) {
                if (terrain.get(x, y) === wallMask) this.blocked[index(x, y)] = 1;
            }
        }
        for (const tile of options.obstacles ?? []) {
            if (inRoom(tile.x, tile.y)) this.blocked[index(tile.x, tile.y)] = 1;
        }
        // The anchor holds the spawn, so nothing may be built or walked there.
        this.blocked[this.anchorIdx] = 1;

        this.minAnchorOpen = Math.min(
            options.anchorBreathingRoom ?? DEFAULT_ANCHOR_BREATHING_ROOM,
            this.openNeighbors(this.anchorIdx),
        );
        this.baseSeed = this.pickBaseSeed();
        this.reach = this.floodReachable();
        this.reachCount = count(this.reach);
        this.dist = this.floodDistances();
    }

    /** The tile beside the spawn that opens onto the largest area: that area is the base. */
    private pickBaseSeed(): number {
        let seed = -1;
        let best = 0;
        for (const idx of this.openAnchorNeighbors()) {
            const size = count(this.flood([idx], () => undefined));
            if (size > best) {
                best = size;
                seed = idx;
            }
        }
        return seed;
    }

    /**
     * The seed to measure from now. The base area only ever loses the tiles built on it, so
     * once the seed itself is built on any other open tile beside the spawn stands in.
     */
    private currentSeed(): number {
        if (this.baseSeed >= 0 && !this.blocked[this.baseSeed]) return this.baseSeed;
        return this.openAnchorNeighbors().find(idx => !this.reach || this.reach[idx] === 1) ?? -1;
    }

    private openAnchorNeighbors(): number[] {
        const { x, y } = toTile(this.anchorIdx);
        const open: number[] = [];
        for (const offset of RING) {
            const nx = x + offset.x;
            const ny = y + offset.y;
            if (!inRoom(nx, ny)) continue;
            const idx = index(nx, ny);
            if (!this.blocked[idx]) open.push(idx);
        }
        return open;
    }

    /** Walking distance from the anchor, measured before anything was claimed; -1 if unreachable. */
    public distanceAt(idx: number): number {
        return this.dist[idx];
    }

    public isOpen(idx: number): boolean {
        return this.blocked[idx] === 0;
    }

    public isReachable(idx: number): boolean {
        return this.reach[idx] === 1;
    }

    /** Registers tiles that must keep creep access. Already unreachable tiles are ignored. */
    public guard(tiles: Tile[]): void {
        for (const tile of tiles) {
            if (!inRoom(tile.x, tile.y)) continue;
            const idx = index(tile.x, tile.y);
            if (isServiced(this.reach, idx)) this.guarded.add(idx);
        }
    }

    /**
     * Puts a structure on the tile, unless doing so would seal the anchor off from a
     * guarded tile or from anything claimed earlier. Returns false and leaves the grid
     * untouched when the tile is rejected.
     */
    public claim(idx: number): boolean {
        if (this.blocked[idx] || !this.reach[idx]) return false;

        this.blocked[idx] = 1;
        // Exactly one open group around the tile means no path routed through it, so
        // blocking it cannot disconnect anything and no full check is needed. The tile
        // itself and its neighbours still have to keep a free tile beside them: creeps
        // reach a structure by standing next to it, not by walking onto it.
        if (
            this.ringGroups(idx) === 1 &&
            this.anchorHasBreathingRoom() &&
            this.openNeighbors(idx) > 0 &&
            this.neighborsKeepAccess(idx)
        ) {
            this.reachCount--;
            this.guarded.add(idx);
            return true;
        }

        if (this.checks >= this.maxChecks) {
            this.blocked[idx] = 0;
            return false;
        }
        this.checks++;

        const nextReach = this.floodReachable();
        const nextCount = count(nextReach);
        const stillConnected =
            this.anchorHasBreathingRoom() &&
            // Blocking a tile may cost that tile and nothing else: walling off a corner of
            // your own room is never worth a structure.
            nextCount === this.reachCount - 1 &&
            isServiced(nextReach, idx) &&
            [...this.guarded].every(g => isServiced(nextReach, g));

        if (!stillConnected) {
            this.blocked[idx] = 0;
            return false;
        }

        this.reach = nextReach;
        this.reachCount = nextCount;
        this.guarded.add(idx);
        return true;
    }

    /**
     * True when every guarded tile next to this one still has a free tile beside it. Only
     * neighbours can lose their last open tile to this claim.
     */
    private neighborsKeepAccess(idx: number): boolean {
        const { x, y } = toTile(idx);
        return RING.every(offset => {
            const nx = x + offset.x;
            const ny = y + offset.y;
            if (!inRoom(nx, ny)) return true;
            const nIdx = index(nx, ny);
            return !this.guarded.has(nIdx) || this.openNeighbors(nIdx) > 0;
        });
    }

    /** Number of contiguous open groups on the 8-tile ring around an index. */
    private ringGroups(idx: number): number {
        const { x, y } = toTile(idx);
        const open = RING.map(offset => {
            const nx = x + offset.x;
            const ny = y + offset.y;
            return inRoom(nx, ny) && !this.blocked[index(nx, ny)];
        });

        let groups = 0;
        for (let i = 0; i < open.length; i++) {
            if (open[i] && !open[(i + open.length - 1) % open.length]) groups++;
        }
        // A fully open ring registers no group starts but is still a single group.
        if (groups === 0 && open.some(o => o)) return 1;
        return groups;
    }

    private anchorHasBreathingRoom(): boolean {
        return this.openNeighbors(this.anchorIdx) >= this.minAnchorOpen;
    }

    private openNeighbors(idx: number): number {
        const { x, y } = toTile(idx);
        return RING.filter(offset => {
            const nx = x + offset.x;
            const ny = y + offset.y;
            return inRoom(nx, ny) && !this.blocked[index(nx, ny)];
        }).length;
    }

    /** The base area: everything a creep can walk to from the tile beside the spawn. */
    private floodReachable(): Uint8Array {
        return this.flood([this.currentSeed()], () => undefined);
    }

    /** Walking distance from the spawn; -1 outside the base area. */
    private floodDistances(): Int16Array {
        const dist = new Int16Array(ROOM_SIZE * ROOM_SIZE).fill(-1);
        this.flood(
            this.openAnchorNeighbors().filter(idx => this.reach[idx] === 1),
            (idx, d) => {
                dist[idx] = d;
            },
        );
        return dist;
    }

    /**
     * Breadth-first flood over open tiles, from the given seed tiles. Creeps move
     * diagonally, so the flood uses all 8 neighbours. Returns the tiles it covered.
     */
    private flood(seeds: number[], visit: (idx: number, dist: number) => void): Uint8Array {
        const seen = new Uint8Array(ROOM_SIZE * ROOM_SIZE);
        let frontier: number[] = [];
        for (const idx of seeds) {
            if (idx < 0 || this.blocked[idx] || seen[idx]) continue;
            seen[idx] = 1;
            frontier.push(idx);
        }

        let distance = 1;
        while (frontier.length > 0) {
            const next: number[] = [];
            for (const idx of frontier) {
                visit(idx, distance);
                const { x, y } = toTile(idx);
                for (const offset of RING) {
                    const nx = x + offset.x;
                    const ny = y + offset.y;
                    if (!inRoom(nx, ny)) continue;
                    const nIdx = index(nx, ny);
                    if (seen[nIdx] || this.blocked[nIdx]) continue;
                    seen[nIdx] = 1;
                    next.push(nIdx);
                }
            }
            frontier = next;
            distance++;
        }
        return seen;
    }
}
