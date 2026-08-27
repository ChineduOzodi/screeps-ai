import { assert } from "chai";
import sinon from "sinon";
import { ConstructionManager } from "./construction-manager";

const ROOM_NAME = "W1N1";
const SPAWN = { x: 25, y: 25 };

interface TileContents {
    structures: any[];
    sites: any[];
}

interface World {
    walls: Set<string>;
    tiles: Map<string, TileContents>;
}

let world: World;

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

function createWorld(): World {
    return { walls: new Set<string>(), tiles: new Map<string, TileContents>() };
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

function addStructure(x: number, y: number, structureType: string): any {
    const structure = { structureType, pos: new MockRoomPosition(x, y, ROOM_NAME), my: true };
    tileAt(x, y).structures.push(structure);
    return structure;
}

function addSite(x: number, y: number, structureType: string): any {
    const site = { structureType, pos: new MockRoomPosition(x, y, ROOM_NAME), my: true };
    tileAt(x, y).sites.push(site);
    return site;
}

function allStructures(): any[] {
    return [...world.tiles.values()].flatMap(t => t.structures);
}

function allSites(): any[] {
    return [...world.tiles.values()].flatMap(t => t.sites);
}

function applyFilter(results: any[], opts?: any): any[] {
    return opts?.filter ? results.filter(opts.filter) : results;
}

/** Walls the tiles the old planner hard-coded for storage, terminal, link and towers. */
function wallOffFixedCoreSlots(): void {
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
        world.walls.add(`${SPAWN.x + offset.x},${SPAWN.y + offset.y}`);
    }
}

describe("ConstructionManager core structures", () => {
    let room: any;
    let spawn: any;
    let manager: ConstructionManager;
    let originalRoomPosition: any;

    const setup = (level: number): void => {
        room = {
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
                default:
                    return [];
            }
        };
        room.createConstructionSite = sinon.stub().callsFake((pos: MockRoomPosition, type: string) => {
            addSite(pos.x, pos.y, type);
            return OK;
        });

        Game.rooms[ROOM_NAME] = room; // placeConstructionSites resolves the room by name
        spawn = { id: "spawn-1", pos: new MockRoomPosition(SPAWN.x, SPAWN.y, ROOM_NAME), room };
        addStructure(SPAWN.x, SPAWN.y, STRUCTURE_SPAWN);
        manager = new ConstructionManager({ getMainRoom: () => room, getMainSpawn: () => spawn } as any);
    };

    const sitesOfType = (type: string): any[] =>
        room.createConstructionSite.getCalls().filter((c: any) => c.args[1] === type);

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

    it("places storage even when the old fixed tile is a wall", () => {
        wallOffFixedCoreSlots();
        setup(4);

        (manager as any).planStorage();

        const storage = sitesOfType(STRUCTURE_STORAGE);
        assert.equal(storage.length, 1);
        const pos = storage[0].args[0];
        assert.isFalse(world.walls.has(`${pos.x},${pos.y}`));
    });

    it("places the terminal next to the planned storage", () => {
        wallOffFixedCoreSlots();
        setup(6);

        (manager as any).planStorage();
        (manager as any).planTerminal();

        const storagePos = sitesOfType(STRUCTURE_STORAGE)[0].args[0];
        const terminalPos = sitesOfType(STRUCTURE_TERMINAL)[0].args[0];
        const range = Math.max(Math.abs(storagePos.x - terminalPos.x), Math.abs(storagePos.y - terminalPos.y));
        assert.isAtMost(range, 3);
    });

    it("places every tower the RCL allows even when the old fixed tiles are walls", () => {
        wallOffFixedCoreSlots();
        setup(5); // RCL 5 allows 2 towers

        manager.planTowers();

        const towers = sitesOfType(STRUCTURE_TOWER);
        assert.equal(towers.length, 2);
        for (const call of towers) {
            const pos = call.args[0];
            assert.isFalse(world.walls.has(`${pos.x},${pos.y}`), "must not build into a wall");
            assert.isAtLeast(
                Math.max(Math.abs(pos.x - SPAWN.x), Math.abs(pos.y - SPAWN.y)),
                2,
                "towers do not belong on the spawn ring",
            );
        }
    });

    it("stops once the RCL tower cap is met", () => {
        setup(3); // RCL 3 allows 1 tower
        addStructure(20, 20, STRUCTURE_TOWER);

        manager.planTowers();

        assert.isEmpty(sitesOfType(STRUCTURE_TOWER));
    });

    it("caches the core plan and keeps placing the same tiles", () => {
        setup(5);

        (manager as any).planStorage();
        const plan = room.memory.corePlan;
        assert.isDefined(plan);
        assert.equal(plan.spawnId, "spawn-1");
        assert.equal(plan.plannedAt, 1000);
        assert.equal(plan.plan.towers.length, 6, "the plan covers the RCL 8 cap up front");

        Game.time = 1010;
        manager.planTowers();

        assert.equal(room.memory.corePlan.plannedAt, 1000, "should not replan a complete core");
        const towerTiles = sitesOfType(STRUCTURE_TOWER).map((c: any) => `${c.args[0].x},${c.args[0].y}`);
        assert.deepEqual(
            towerTiles,
            plan.plan.towers.slice(0, 2).map((t: any) => `${t.x},${t.y}`),
        );
    });

    it("places a lab cluster that can actually run a reaction", () => {
        wallOffFixedCoreSlots();
        setup(6); // RCL 6 allows 3 labs

        (manager as any).planLabs();

        const labs = sitesOfType(STRUCTURE_LAB).map((c: any) => ({ x: c.args[0].x, y: c.args[0].y }));
        assert.equal(labs.length, 3);

        const range = (a: any, b: any) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        const [inputA, inputB] = room.memory.corePlan.plan.labs;
        for (const lab of labs) {
            assert.isFalse(world.walls.has(`${lab.x},${lab.y}`), "must not build into a wall");
            assert.isAtMost(range(lab, inputA), 2, "output labs must reach the first reagent lab");
            assert.isAtMost(range(lab, inputB), 2, "output labs must reach the second reagent lab");
        }
    });

    it("places the factory and observer on real tiles", () => {
        wallOffFixedCoreSlots();
        setup(8);

        (manager as any).planFactory();
        (manager as any).planObserver();

        for (const type of [STRUCTURE_FACTORY, STRUCTURE_OBSERVER]) {
            const sites = sitesOfType(type);
            assert.equal(sites.length, 1, `expected exactly one ${type}`);
            const pos = sites[0].args[0];
            assert.isFalse(world.walls.has(`${pos.x},${pos.y}`));
        }
    });

    it("keeps the extension field off the core tiles", () => {
        setup(4);

        (manager as any).planExtensions();

        const core = room.memory.corePlan.plan;
        const coreTiles = new Set(
            [core.storage, core.terminal, core.link, core.factory, core.observer, ...core.towers, ...core.labs]
                .filter(Boolean)
                .map((t: any) => `${t.x},${t.y}`),
        );

        assert.isNotEmpty(sitesOfType(STRUCTURE_EXTENSION));
        for (const call of sitesOfType(STRUCTURE_EXTENSION)) {
            const pos = call.args[0];
            assert.isFalse(coreTiles.has(`${pos.x},${pos.y}`), `extension squatted on core tile ${pos.x},${pos.y}`);
        }
    });
});
