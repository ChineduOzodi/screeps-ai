/**
 * Terrain-aware planner for the base core: storage, terminal, the storage link, the
 * towers, the lab cluster, the factory and the observer.
 *
 * These used to be fixed spawn offsets - storage at +2/0, terminal at -2/0, towers on four
 * diagonals - or a blind spiral outward from the spawn, and the planner simply gave up when
 * a tile happened to be a wall. In a cramped room that means a colony that never gets
 * storage, never gets a terminal, never builds a tower it can defend itself with, and ends
 * up with labs scattered too far apart to run a reaction.
 *
 * The core is instead placed on whatever tiles the room actually offers, closest to the
 * spawn first, keeping the hub structures next to each other, the labs in one reaction
 * cluster and the towers spread out. Every placement goes through RoomGrid, so the core can
 * never wall the spawn in.
 */
import { TerrainLike } from "./min-cut";
import {
    MAX_BUILD,
    MIN_BUILD,
    RING,
    RoomGrid,
    Tile,
    chebyshev,
    index,
    inRoom,
    isBuildable,
    toIndexSet,
    toTile,
} from "./room-grid";
import { RoomSurvey } from "./room-survey";

export interface CorePlan {
    storage?: Tile;
    terminal?: Tile;
    /** The link that feeds storage, i.e. the receiving end of the link network. */
    link?: Tile;
    towers: Tile[];
    /** The lab cluster. The first two are the reaction input labs. */
    labs: Tile[];
    factory?: Tile;
    observer?: Tile;
}

export interface CorePlanRequest {
    terrain: TerrainLike;
    /** Spawn position. The core is built around it. */
    anchor: Tile;
    /** Towers to plan for in total, including any that already stand. */
    towerCount: number;
    /** Labs to plan for in total, including any that already stand. */
    labCount: number;
    /** Core structures that already exist. Their tiles are kept as-is. */
    existing?: Partial<CorePlan>;
    /** Tiles occupied by existing structures: neither buildable nor walkable. */
    obstacles?: Tile[];
    /** Walkable tiles we must leave unbuilt (source and controller access). */
    reserved?: Tile[];
    /** Tiles that must still be reachable from the anchor once the core is built. */
    keepReachable?: Tile[];
    /** Terrain value that means "wall". Defaults to TERRAIN_MASK_WALL (1). */
    wallMask?: number;
}

/** Storage, terminal and link belong in the heart of the base. */
const HUB_MAX_RANGE = 5;
/** A hauler standing between storage and link can serve both at this range. */
const LINK_HUB_RANGE = 2;
const TERMINAL_HUB_RANGE = 3;
/** Towers still have to cover the base, so they stay near the spawn too. */
const TOWER_MAX_RANGE = 8;
/** Towers are pushed this far apart before the requirement is relaxed. */
const TOWER_SPACING = [3, 2, 1];
/** Towers do not belong on the spawn's own ring, where haulers queue. */
const TOWER_MIN_SPAWN_RANGE = 2;
/** An output lab must be within this range of both input labs to run a reaction. */
const LAB_REACTION_RANGE = 2;
const LAB_MAX_RANGE = 8;
/** Labs belong in their own pocket, not jammed against the spawn where haulers work. */
const LAB_MIN_SPAWN_RANGE = 2;
/**
 * Spare tiles a lab pocket needs beyond the cluster itself. Some tiles in a pocket end up
 * unusable once their neighbours are built, so a pocket sized exactly to the cluster comes
 * up short; with slack the search keeps looking for a roomier one.
 */
const LAB_REGION_SLACK = 4;
/** The factory pulls from storage, so keep the haul short. */
const FACTORY_MAX_RANGE = 8;
/** The observer works from anywhere in the room; it just needs a safe tile. */
const OBSERVER_MAX_RANGE = 12;

interface Candidate {
    idx: number;
    dist: number;
}

export class CorePlanner {
    /**
     * Plans the base core. Pure: it only reads the request, so it can be unit tested
     * against synthetic terrain.
     */
    public static plan(request: CorePlanRequest): CorePlan {
        const { terrain, anchor } = request;
        const existing = request.existing ?? {};
        const plan: CorePlan = {
            storage: existing.storage,
            terminal: existing.terminal,
            link: existing.link,
            factory: existing.factory,
            observer: existing.observer,
            towers: [...(existing.towers ?? [])],
            labs: [...(existing.labs ?? [])],
        };
        if (!inRoom(anchor.x, anchor.y)) return plan;

        const noBuild = toIndexSet(request.reserved);
        const grid = new RoomGrid(terrain, anchor, { wallMask: request.wallMask, obstacles: request.obstacles });
        grid.guard(request.keepReachable ?? []);

        // Everything the core may sit on, nearest to the spawn first.
        const candidates: Candidate[] = [];
        for (let y = MIN_BUILD; y <= MAX_BUILD; y++) {
            for (let x = MIN_BUILD; x <= MAX_BUILD; x++) {
                const idx = index(x, y);
                if (!grid.isOpen(idx) || noBuild.has(idx)) continue;
                const dist = grid.distanceAt(idx);
                if (dist <= 0 || dist > OBSERVER_MAX_RANGE) continue;
                candidates.push({ idx, dist });
            }
        }
        candidates.sort((a, b) => a.dist - b.dist || a.idx - b.idx);

        const spent = new Set<number>();
        const usable = (idx: number): boolean => !spent.has(idx) && grid.isOpen(idx) && !noBuild.has(idx);
        /** Claims one specific tile. A tile that cannot take a structure is retired. */
        const takeTile = (tile: Tile): Tile | undefined => {
            if (!isBuildable(tile.x, tile.y)) return undefined;
            const idx = index(tile.x, tile.y);
            if (!usable(idx)) return undefined;
            // A rejected tile would be rejected again later, so retire it either way.
            spent.add(idx);
            return grid.claim(idx) ? tile : undefined;
        };
        /** Claims the nearest tile to the spawn that the caller accepts. */
        const take = (accept: (tile: Tile, dist: number) => boolean): Tile | undefined => {
            for (const candidate of candidates) {
                if (spent.has(candidate.idx)) continue;
                const tile = toTile(candidate.idx);
                if (!accept(tile, candidate.dist)) continue;
                if (takeTile(tile)) return tile;
            }
            return undefined;
        };

        plan.storage ??= take((_tile, dist) => dist <= HUB_MAX_RANGE);

        // Keep the link and terminal beside storage; fall back to anywhere in the hub so a
        // tight room still gets them somewhere sane.
        const hub = plan.storage ?? anchor;
        const nearHub = (range: number) => (tile: Tile, dist: number) =>
            dist <= HUB_MAX_RANGE && chebyshev(tile, hub) <= range;

        plan.link ??= take(nearHub(LINK_HUB_RANGE)) ?? take((_tile, dist) => dist <= HUB_MAX_RANGE);
        plan.terminal ??= take(nearHub(TERMINAL_HUB_RANGE)) ?? take((_tile, dist) => dist <= HUB_MAX_RANGE);

        // Labs go before towers: a tower fits on any free tile, while the lab cluster needs
        // one contiguous pocket and is the first thing a scattered core makes impossible.
        CorePlanner.claimLabs(plan, grid, anchor, candidates, usable, takeTile, request.labCount);

        for (const spacing of TOWER_SPACING) {
            while (plan.towers.length < request.towerCount) {
                const tower = take(
                    (tile, dist) =>
                        dist <= TOWER_MAX_RANGE &&
                        chebyshev(tile, anchor) >= TOWER_MIN_SPAWN_RANGE &&
                        plan.towers.every(other => chebyshev(other, tile) >= spacing),
                );
                if (!tower) break;
                plan.towers.push(tower);
            }
            if (plan.towers.length >= request.towerCount) break;
            // Nothing left at this spacing: let the next, tighter pass reconsider the
            // tiles it skipped.
            spent.clear();
        }

        spent.clear();
        plan.factory ??= take((_tile, dist) => dist <= FACTORY_MAX_RANGE);
        plan.observer ??= take((_tile, dist) => dist <= OBSERVER_MAX_RANGE);

        return plan;
    }

    /**
     * Lays out the lab cluster. Reactions need every output lab within range 2 of both
     * input labs, so the cluster is built from an adjacent pair of tiles - the inputs -
     * and the tiles their reaction ranges share.
     */
    private static claimLabs(
        plan: CorePlan,
        grid: RoomGrid,
        anchor: Tile,
        candidates: Candidate[],
        usable: (idx: number) => boolean,
        takeTile: (tile: Tile) => Tile | undefined,
        labCount: number,
    ): void {
        if (plan.labs.length >= labCount) return;

        const inputs = CorePlanner.findLabInputs(plan.labs, grid, anchor, candidates, usable, labCount);
        if (!inputs) return;

        const alreadyPlanned = (tile: Tile): boolean => plan.labs.some(lab => lab.x === tile.x && lab.y === tile.y);

        // The inputs come first so the lab manager's reagent labs sit at the centre.
        for (const input of inputs) {
            if (alreadyPlanned(input)) continue;
            if (takeTile(input)) plan.labs.push(input);
        }

        // Fill the shared reaction range. Like the extension field this prefers one
        // checkerboard parity, which keeps a free tile beside every lab - a solid block of
        // labs would leave the middle ones unreachable.
        const parity = (inputs[0].x + inputs[0].y) % 2;
        const region = CorePlanner.reactionRegion(inputs, anchor, usable, grid).sort(
            (a, b) =>
                ((a.x + a.y) % 2 === parity ? 0 : 1) - ((b.x + b.y) % 2 === parity ? 0 : 1) ||
                chebyshev(a, inputs[0]) - chebyshev(b, inputs[0]) ||
                index(a.x, a.y) - index(b.x, b.y),
        );
        for (const tile of region) {
            if (plan.labs.length >= labCount) break;
            if (alreadyPlanned(tile)) continue;
            if (takeTile(tile)) plan.labs.push(tile);
        }
    }

    /**
     * Picks the two input labs. Labs that already stand win - the cluster has to grow
     * around what is built - otherwise the search takes the adjacent pair of free tiles
     * whose shared reaction range holds room for the whole cluster, nearest one first.
     */
    private static findLabInputs(
        existingLabs: Tile[],
        grid: RoomGrid,
        anchor: Tile,
        candidates: Candidate[],
        usable: (idx: number) => boolean,
        labCount: number,
    ): [Tile, Tile] | undefined {
        if (existingLabs.length >= 2) {
            // Same rule the lab manager uses to choose its reagent labs: the two with the
            // most neighbours in reaction range.
            const scored = [...existingLabs].sort(
                (a, b) => CorePlanner.labNeighbors(b, existingLabs) - CorePlanner.labNeighbors(a, existingLabs),
            );
            return [scored[0], scored[1]];
        }

        // Pockets to try: the one standing lab, or every free tile near the spawn.
        const candidates2: { tile: Tile; dist: number }[] = existingLabs[0]
            ? [{ tile: existingLabs[0], dist: 0 }]
            : candidates
                  .filter(
                      c =>
                          c.dist <= LAB_MAX_RANGE &&
                          usable(c.idx) &&
                          chebyshev(toTile(c.idx), anchor) >= LAB_MIN_SPAWN_RANGE,
                  )
                  .map(c => ({ tile: toTile(c.idx), dist: c.dist }));

        let best: { pair: [Tile, Tile]; fits: boolean; size: number; dist: number } | undefined;
        for (const candidate of candidates2) {
            for (const offset of RING) {
                const partner = { x: candidate.tile.x + offset.x, y: candidate.tile.y + offset.y };
                if (!isBuildable(partner.x, partner.y) || !usable(index(partner.x, partner.y))) continue;
                if (chebyshev(partner, anchor) < LAB_MIN_SPAWN_RANGE) continue;

                // The region already counts the two input tiles themselves.
                const size = CorePlanner.reactionRegion([candidate.tile, partner], anchor, usable, grid).length;
                const fits = size >= labCount + LAB_REGION_SLACK;
                // Prefer a pocket that holds the whole cluster and sits close to the spawn;
                // when nothing fits, take the roomiest pocket we found.
                const better = !best
                    ? true
                    : fits !== best.fits
                      ? fits
                      : fits
                        ? candidate.dist < best.dist
                        : size > best.size;
                if (better) best = { pair: [candidate.tile, partner], fits, size, dist: candidate.dist };
            }
            // The first candidate that fits is also the nearest, since they are sorted.
            if (best?.fits) break;
        }
        return best?.pair;
    }

    /** Free tiles within reaction range of both input labs, clear of the spawn. */
    private static reactionRegion(
        inputs: Tile[],
        anchor: Tile,
        usable: (idx: number) => boolean,
        grid: RoomGrid,
    ): Tile[] {
        const [a, b] = inputs;
        const region: Tile[] = [];
        for (let x = a.x - LAB_REACTION_RANGE; x <= a.x + LAB_REACTION_RANGE; x++) {
            for (let y = a.y - LAB_REACTION_RANGE; y <= a.y + LAB_REACTION_RANGE; y++) {
                if (!isBuildable(x, y)) continue;
                const tile = { x, y };
                if (chebyshev(tile, b) > LAB_REACTION_RANGE) continue;
                if (chebyshev(tile, anchor) < LAB_MIN_SPAWN_RANGE) continue;
                const idx = index(x, y);
                if (!usable(idx) || grid.distanceAt(idx) <= 0) continue;
                region.push(tile);
            }
        }
        return region;
    }

    private static labNeighbors(lab: Tile, labs: Tile[]): number {
        return labs.filter(other => other !== lab && chebyshev(other, lab) <= LAB_REACTION_RANGE).length;
    }

    /** Builds a core plan from live room state. */
    public static forRoom(
        room: Room,
        spawn: StructureSpawn,
        caps: { towers: number; labs: number },
        survey: RoomSurvey,
    ): CorePlan {
        if (typeof room.getTerrain !== "function") return { towers: [], labs: [] };

        return CorePlanner.plan({
            terrain: room.getTerrain(),
            anchor: { x: spawn.pos.x, y: spawn.pos.y },
            towerCount: caps.towers,
            labCount: caps.labs,
            existing: CorePlanner.findExisting(room, spawn),
            obstacles: survey.obstacles,
            reserved: survey.reserved,
            keepReachable: survey.keepReachable,
            wallMask: TERRAIN_MASK_WALL,
        });
    }

    /** Core structures already standing or queued, so the plan keeps them where they are. */
    private static findExisting(room: Room, spawn: StructureSpawn): Partial<CorePlan> {
        const existing: Partial<CorePlan> = { towers: [], labs: [] };
        const built = [...room.find(FIND_MY_STRUCTURES), ...room.find(FIND_MY_CONSTRUCTION_SITES)];

        for (const structure of built) {
            const tile = { x: structure.pos.x, y: structure.pos.y };
            switch (structure.structureType) {
                case STRUCTURE_STORAGE:
                    existing.storage ??= tile;
                    break;
                case STRUCTURE_TERMINAL:
                    existing.terminal ??= tile;
                    break;
                case STRUCTURE_FACTORY:
                    existing.factory ??= tile;
                    break;
                case STRUCTURE_OBSERVER:
                    existing.observer ??= tile;
                    break;
                case STRUCTURE_TOWER:
                    existing.towers?.push(tile);
                    break;
                case STRUCTURE_LAB:
                    existing.labs?.push(tile);
                    break;
                case STRUCTURE_LINK:
                    // Only the link serving the hub counts; source and controller links are
                    // placed separately.
                    if (chebyshev(tile, spawn.pos) <= HUB_MAX_RANGE) existing.link ??= tile;
                    break;
                default:
                    break;
            }
        }
        return existing;
    }

    /** Every tile the core plan claims, for other planners to reserve. */
    public static planTiles(plan: CorePlan): Tile[] {
        const tiles: Tile[] = [...plan.towers, ...plan.labs];
        for (const tile of [plan.storage, plan.terminal, plan.link, plan.factory, plan.observer]) {
            if (tile) tiles.push(tile);
        }
        return tiles;
    }
}
