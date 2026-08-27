import { assert } from "chai";
import sinon from "sinon";
import { ConstructionManager } from "./construction-manager";

const ROOM_NAME = "W1N1";
const SPAWN_POS = { x: 25, y: 25 };

interface TileContents {
    structures: any[];
    sites: any[];
}

/**
 * Minimal world the extension planner and the manager can both read: terrain walls plus a
 * per-tile record of what stands on it.
 */
interface World {
    walls: Set<string>;
    tiles: Map<string, TileContents>;
    sources: any[];
    minerals: any[];
}

function createWorld(): World {
    return { walls: new Set<string>(), tiles: new Map<string, TileContents>(), sources: [], minerals: [] };
}

function tileAt(x: number, y: number): TileContents {
    const key = `${x},${y}`;
    let tile = world.tiles.get(key);
    if (!tile) {
        tile = { structures: [], sites: [] };
        world.tiles.set(key, tile);
    }
    return tile;
}

function addStructure(x: number, y: number, structureType: string, extra: any = {}): any {
    const structure = { structureType, pos: new MockRoomPosition(x, y, ROOM_NAME), my: true, ...extra };
    tileAt(x, y).structures.push(structure);
    return structure;
}

function addSite(x: number, y: number, structureType: string, extra: any = {}): any {
    const site = { structureType, pos: new MockRoomPosition(x, y, ROOM_NAME), my: true, ...extra };
    tileAt(x, y).sites.push(site);
    return site;
}

function allStructures(): any[] {
    return [...world.tiles.values()].flatMap(t => t.structures);
}

function allSites(): any[] {
    return [...world.tiles.values()].flatMap(t => t.sites);
}

/** Walls off everything except a vertical corridor `width` tiles wide through x=25. */
function carveCorridor(width: number): void {
    const half = Math.floor(width / 2);
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            const inCorridor = x >= 25 - half && x <= 25 - half + width - 1 && y >= 5 && y <= 44;
            if (!inCorridor) world.walls.add(`${x},${y}`);
        }
    }
}

let world: World = createWorld();

class MockRoomPosition {
    public x: number;
    public y: number;
    public roomName: string;

    public constructor(x: number, y: number, roomName: string) {
        this.x = x;
        this.y = y;
        this.roomName = roomName;
    }

    public lookFor(type: string): any[] {
        const tile = world.tiles.get(`${this.x},${this.y}`);
        if (!tile) return [];
        return type === LOOK_STRUCTURES ? tile.structures : tile.sites;
    }

    public inRangeTo(other: { x: number; y: number }, range: number): boolean {
        return Math.max(Math.abs(this.x - other.x), Math.abs(this.y - other.y)) <= range;
    }
}

function applyFilter(results: any[], opts?: any): any[] {
    return opts?.filter ? results.filter(opts.filter) : results;
}

function buildRoom(level: number): any {
    const room: any = {
        name: ROOM_NAME,
        memory: {},
        controller: { level, my: true, pos: new MockRoomPosition(10, 40, ROOM_NAME) },
        getTerrain: () => ({ get: (x: number, y: number) => (world.walls.has(`${x},${y}`) ? 1 : 0) }),
        lookForAt: (type: string, pos: MockRoomPosition) => pos.lookFor(type),
    };

    room.find = (type: number, opts?: any): any[] => {
        switch (type) {
            case FIND_STRUCTURES:
            case FIND_MY_STRUCTURES:
                return applyFilter(allStructures(), opts);
            case FIND_CONSTRUCTION_SITES:
            case FIND_MY_CONSTRUCTION_SITES:
                return applyFilter(allSites(), opts);
            case FIND_SOURCES:
                return applyFilter(world.sources, opts);
            case FIND_MINERALS:
                return applyFilter(world.minerals, opts);
            default:
                return [];
        }
    };

    room.createConstructionSite = sinon.stub().callsFake((pos: MockRoomPosition, type: string) => {
        addSite(pos.x, pos.y, type);
        return OK;
    });

    return room;
}

describe("ConstructionManager.planExtensions", () => {
    let room: any;
    let spawn: any;
    let manager: ConstructionManager;
    let originalRoomPosition: any;

    const setup = (level: number): void => {
        room = buildRoom(level);
        spawn = { id: "spawn-1", pos: new MockRoomPosition(SPAWN_POS.x, SPAWN_POS.y, ROOM_NAME), room };
        addStructure(SPAWN_POS.x, SPAWN_POS.y, STRUCTURE_SPAWN);
        manager = new ConstructionManager({ getMainRoom: () => room, getMainSpawn: () => spawn } as any);
    };

    const extensionSiteCalls = (): any[] =>
        room.createConstructionSite.getCalls().filter((c: any) => c.args[1] === STRUCTURE_EXTENSION);

    const roadSiteCalls = (): any[] =>
        room.createConstructionSite.getCalls().filter((c: any) => c.args[1] === STRUCTURE_ROAD);

    beforeEach(() => {
        world = createWorld();
        // @ts-ignore - the manager builds positions through the global constructor
        originalRoomPosition = global.RoomPosition;
        // @ts-ignore
        global.RoomPosition = MockRoomPosition;
        // @ts-ignore
        global.Game = { time: 1000, rooms: {}, constructionSites: {} };
        // @ts-ignore
        global.Memory = {};
    });

    afterEach(() => {
        // @ts-ignore
        global.RoomPosition = originalRoomPosition;
        sinon.restore();
    });

    it("places every extension the RCL allows in an open room", () => {
        setup(3); // RCL 3 allows 10 extensions

        (manager as any).planExtensions();

        assert.equal(extensionSiteCalls().length, 10);
    });

    it("places extensions in a cramped room where no 5-tile cluster fits", () => {
        carveCorridor(3);
        setup(3);

        (manager as any).planExtensions();

        assert.equal(extensionSiteCalls().length, 10, "a 3-wide corridor still has room for RCL 3 extensions");
        for (const call of extensionSiteCalls()) {
            const pos = call.args[0];
            assert.isFalse(world.walls.has(`${pos.x},${pos.y}`), "must not build into a wall");
        }
    });

    it("does nothing once the RCL cap is reached", () => {
        setup(2); // RCL 2 allows 5 extensions
        for (let i = 0; i < 5; i++) addStructure(20 + i, 20, STRUCTURE_EXTENSION);

        (manager as any).planExtensions();

        assert.isFalse(room.createConstructionSite.called);
    });

    it("caches the plan in room memory and reuses it", () => {
        setup(2);

        (manager as any).planExtensions();
        const plan = room.memory.extensionPlan;
        assert.isDefined(plan);
        assert.equal(plan.spawnId, "spawn-1");
        assert.equal(plan.plannedAt, 1000);
        assert.isAbove(plan.extensions.length, 5);

        Game.time = 1010;
        (manager as any).planExtensions();

        assert.equal(room.memory.extensionPlan.plannedAt, 1000, "should not replan while the plan still fits");
        assert.deepEqual(room.memory.extensionPlan.extensions, plan.extensions);
    });

    it("skips tiles that already hold an extension", () => {
        setup(2);
        (manager as any).planExtensions();
        const planned = room.memory.extensionPlan.extensions;

        // Start over with the first two planned tiles already built.
        const builtTiles = planned.slice(0, 2);
        world = createWorld();
        setup(2);
        room.memory.extensionPlan = { spawnId: "spawn-1", plannedAt: 1000, extensions: planned, roads: [] };
        for (const tile of builtTiles) addStructure(tile.x, tile.y, STRUCTURE_EXTENSION);

        (manager as any).planExtensions();

        assert.equal(extensionSiteCalls().length, 3, "5 allowed minus the 2 already standing");
        for (const call of extensionSiteCalls()) {
            const pos = call.args[0];
            assert.isFalse(
                builtTiles.some((t: any) => t.x === pos.x && t.y === pos.y),
                "must not re-place an existing extension",
            );
        }
    });

    it("clears a road sitting on a planned extension tile", () => {
        setup(2);
        (manager as any).planExtensions();
        const first = room.memory.extensionPlan.extensions[0];

        world = createWorld();
        setup(2);
        room.memory.extensionPlan = {
            spawnId: "spawn-1",
            plannedAt: 1000,
            extensions: [first],
            roads: [],
        };
        const road = addStructure(first.x, first.y, STRUCTURE_ROAD, { destroy: sinon.stub() });

        (manager as any).planExtensions();

        assert.isTrue(road.destroy.calledOnce, "the road should make way for the extension");
        assert.equal(extensionSiteCalls().length, 1);
    });

    it("only paves walkways that several extensions border", () => {
        setup(4); // RCL 4 allows 20 extensions, enough to form a field

        (manager as any).planExtensions();

        assert.isNotEmpty(extensionSiteCalls());
        for (const call of roadSiteCalls()) {
            const pos = call.args[0];
            const neighbours = [
                { x: pos.x, y: pos.y - 1 },
                { x: pos.x + 1, y: pos.y },
                { x: pos.x, y: pos.y + 1 },
                { x: pos.x - 1, y: pos.y },
            ].filter(t => {
                const tile = world.tiles.get(`${t.x},${t.y}`);
                if (!tile) return false;
                return [...tile.structures, ...tile.sites].some(s => s.structureType === STRUCTURE_EXTENSION);
            }).length;
            assert.isAtLeast(neighbours, 2, `walkway at ${pos.x},${pos.y} does not serve enough extensions`);
        }
    });

    it("keeps the tiles around sources and the controller clear", () => {
        setup(4);
        world.sources = [{ pos: new MockRoomPosition(30, 30, ROOM_NAME) }];

        (manager as any).planExtensions();

        const forbidden = new Set<string>();
        for (const [cx, cy] of [
            [30, 30],
            [room.controller.pos.x, room.controller.pos.y],
        ]) {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) forbidden.add(`${cx + dx},${cy + dy}`);
            }
        }

        for (const call of room.createConstructionSite.getCalls()) {
            const pos = call.args[0];
            assert.isFalse(forbidden.has(`${pos.x},${pos.y}`), `built on reserved tile ${pos.x},${pos.y}`);
        }
    });
});
