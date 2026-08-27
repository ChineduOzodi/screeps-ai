/**
 * Terrain-aware extension planner.
 *
 * The old planner stamped fixed 5-extension "plus" clusters at hard-coded offsets from
 * the spawn and gave up on a cluster unless all 13 of its tiles (5 extensions + 8 roads)
 * were free. In a cramped room - walls close to the spawn, sources tucked into pockets -
 * no cluster ever fits and the colony never builds a single extension.
 *
 * This planner instead flood-fills outward from the spawn and takes whatever buildable
 * tiles it finds, preferring a checkerboard so that every extension keeps an open tile
 * orthogonally next to it and creeps can still walk the field. Off-checkerboard tiles are
 * used when the room is too tight to be picky. Every placement goes through RoomGrid, so
 * it can never cut the spawn off from the sources, the controller or the exits.
 */
import { TerrainLike } from "./min-cut";
import {
    MAX_BUILD,
    MIN_BUILD,
    ORTHOGONAL,
    RoomGrid,
    Tile,
    index,
    inRoom,
    isBuildable,
    toIndexSet,
    toTile,
} from "./room-grid";
import { RoomSurvey } from "./room-survey";

export { Tile } from "./room-grid";

export interface ExtensionPlanRequest {
    terrain: TerrainLike;
    /** Spawn position. The extension field grows outward from here. */
    anchor: Tile;
    /** How many extension tiles to plan. */
    count: number;
    /** Tiles occupied by existing structures: neither buildable nor walkable. */
    obstacles?: Tile[];
    /** Walkable tiles we must leave unbuilt (source/controller access, planned core slots). */
    reserved?: Tile[];
    /** Tiles that must still be reachable from the anchor once the whole plan is built. */
    keepReachable?: Tile[];
    /** Maximum walking distance from the anchor. */
    maxRange?: number;
    /** Terrain value that means "wall". Defaults to TERRAIN_MASK_WALL (1). */
    wallMask?: number;
}

export interface ExtensionPlan {
    /** Extension tiles in build order: closest to the spawn first. */
    extensions: Tile[];
    /** Walkway tiles worth paving once the extensions around them exist. */
    roads: Tile[];
}

const DEFAULT_MAX_RANGE = 15;
/** A walkway is only worth paving once this many extensions sit next to it. */
const ROAD_ADJACENCY_THRESHOLD = 2;

export class ExtensionPlanner {
    /**
     * Plans an extension field. Pure: it only reads the request, so it can be unit tested
     * against synthetic terrain.
     */
    public static plan(request: ExtensionPlanRequest): ExtensionPlan {
        const { terrain, anchor, count } = request;
        if (count <= 0 || !inRoom(anchor.x, anchor.y)) return { extensions: [], roads: [] };

        const maxRange = request.maxRange ?? DEFAULT_MAX_RANGE;
        const noBuild = toIndexSet(request.reserved);

        const grid = new RoomGrid(terrain, anchor, { wallMask: request.wallMask, obstacles: request.obstacles });
        grid.guard(request.keepReachable ?? []);

        // Take the whole checkerboard first, nearest tiles first, and only start eating
        // into the walkway parity when the room is too tight to hold the field otherwise.
        // Doing it in that order also maximises how many extensions a cramped room fits.
        const anchorParity = (anchor.x + anchor.y) % 2;
        const candidates: { idx: number; offParity: number; dist: number }[] = [];
        for (let y = MIN_BUILD; y <= MAX_BUILD; y++) {
            for (let x = MIN_BUILD; x <= MAX_BUILD; x++) {
                const idx = index(x, y);
                if (!grid.isOpen(idx) || noBuild.has(idx)) continue;
                const dist = grid.distanceAt(idx);
                if (dist <= 0 || dist > maxRange) continue;
                candidates.push({ idx, offParity: (x + y) % 2 === anchorParity ? 0 : 1, dist });
            }
        }
        candidates.sort((a, b) => a.offParity - b.offParity || a.dist - b.dist || a.idx - b.idx);

        const extensions: number[] = [];
        for (const candidate of candidates) {
            if (extensions.length >= count) break;
            if (grid.claim(candidate.idx)) extensions.push(candidate.idx);
        }

        return {
            extensions: extensions.map(toTile),
            roads: ExtensionPlanner.planRoads(grid, noBuild, extensions, maxRange).map(toTile),
        };
    }

    /**
     * Builds a plan from live room state. `reserved` carries the tiles the core planner
     * already claimed, so the extension field cannot squat on the storage or a tower.
     */
    public static forRoom(
        room: Room,
        spawn: StructureSpawn,
        count: number,
        survey: RoomSurvey,
        reserved: Tile[] = [],
    ): ExtensionPlan {
        if (typeof room.getTerrain !== "function") return { extensions: [], roads: [] };

        return ExtensionPlanner.plan({
            terrain: room.getTerrain(),
            anchor: { x: spawn.pos.x, y: spawn.pos.y },
            count,
            obstacles: survey.obstacles,
            reserved: [...survey.reserved, ...reserved],
            keepReachable: survey.keepReachable,
            wallMask: TERRAIN_MASK_WALL,
        });
    }

    /** Walkways worth paving: open tiles with several planned extensions around them. */
    private static planRoads(grid: RoomGrid, noBuild: Set<number>, extensions: number[], maxRange: number): number[] {
        const adjacency = new Map<number, number>();
        for (const ext of extensions) {
            const { x, y } = toTile(ext);
            for (const offset of ORTHOGONAL) {
                const nx = x + offset.x;
                const ny = y + offset.y;
                if (!isBuildable(nx, ny)) continue;
                const idx = index(nx, ny);
                if (!grid.isOpen(idx) || noBuild.has(idx)) continue;
                const dist = grid.distanceAt(idx);
                if (dist <= 0 || dist > maxRange) continue;
                adjacency.set(idx, (adjacency.get(idx) ?? 0) + 1);
            }
        }

        return [...adjacency.entries()]
            .filter(([, count]) => count >= ROAD_ADJACENCY_THRESHOLD)
            .map(([idx]) => idx)
            .sort((a, b) => grid.distanceAt(a) - grid.distanceAt(b) || a - b);
    }
}
