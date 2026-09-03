import { assert, expect } from "chai";
import sinon from "sinon";
import { Game, Memory } from "../../test/utils/mock";
import { ConstructionManager } from "./construction-manager";
import { loop } from "../main";

class MockRoomPosition {
    public x: number;
    public y: number;
    public roomName: string;
    constructor(x: number, y: number, roomName: string) {
        this.x = x;
        this.y = y;
        this.roomName = roomName;
    }
    public lookFor(): any[] {
        return [];
    }
}

describe("Construction Manager", () => {
    let colonyMock: any;
    let roomMock: any;
    let constructionManager: ConstructionManager;

    beforeEach(() => {
        // @ts-ignore
        global.Game = _.cloneDeep(Game);
        // @ts-ignore
        global.Memory = _.cloneDeep(Memory);
        // @ts-ignore
        global.Game.player = { name: "player" };
        global.Game.time = 10;
        // @ts-ignore
        global.RoomPosition = MockRoomPosition;
        // @ts-ignore
        global.FIND_RUINS = 123;
        // @ts-ignore
        global.LOOK_STRUCTURES = "structures";
        // @ts-ignore
        global.LOOK_CONSTRUCTION_SITES = "constructionSites";
        // @ts-ignore
        global.STRUCTURE_EXTENSION = "extension";
        // @ts-ignore
        global.STRUCTURE_ROAD = "road";
        // @ts-ignore
        global.STRUCTURE_CONTAINER = "container";
        // @ts-ignore
        global.OK = 0;

        roomMock = {
            name: "W1N1",
            controller: { my: true, level: 1, pos: new MockRoomPosition(20, 20, "W1N1") },
            createConstructionSite: sinon.stub().returns(0),
            find: sinon.stub().callsFake((type, opts) => {
                if (type === FIND_RUINS && opts && opts.filter) {
                    return ruinsList.filter(opts.filter);
                }
                return [];
            }),
        };
        global.Game.rooms.W1N1 = roomMock;

        colonyMock = {
            getMainRoom: () => roomMock,
            getMainSpawn: () => ({ pos: new MockRoomPosition(25, 25, "W1N1") }),
            getCreeps: () => [],
            getSpawnQueue: () => [],
        };
        constructionManager = new ConstructionManager(colonyMock);
    });

    let ruinsList: any[] = [];

    afterEach(() => {
        sinon.restore();
        ruinsList = [];
    });

    it("placeConstructionSites should call createConstructionSite for missing structures", () => {
        const structures = [{ x: 10, y: 10, roomName: "W1N1", type: STRUCTURE_EXTENSION }];

        // Mock lookFor to return empty (meaning structure/site missing)
        const lookForStub = sinon.stub(MockRoomPosition.prototype, "lookFor").returns([]);

        constructionManager.placeConstructionSites(structures);
        assert.isTrue(roomMock.createConstructionSite.calledOnce);

        lookForStub.restore();
    });

    it("rebuildRuins should identify and rebuild ruins, skipping roads", () => {
        ruinsList = [
            {
                structure: { structureType: STRUCTURE_EXTENSION, owner: { username: "player" } },
                pos: new MockRoomPosition(10, 10, "W1N1"),
            },
            {
                structure: { structureType: STRUCTURE_ROAD },
                pos: new MockRoomPosition(11, 11, "W1N1"),
            },
        ];

        // Mock lookFor for ruins
        const lookForStub = sinon.stub(MockRoomPosition.prototype, "lookFor").returns([]);

        // Mock CONTROLLER_STRUCTURES to prevent errors in planTowers during testing
        (global as any).CONTROLLER_STRUCTURES = {
            [STRUCTURE_TOWER]: { 0: 0, 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 6 },
            [STRUCTURE_EXTENSION]: { 0: 0, 1: 0, 2: 5, 3: 10, 4: 20, 5: 30, 6: 40, 7: 50, 8: 60 },
            [STRUCTURE_LINK]: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 2, 6: 3, 7: 4, 8: 6 },
        } as any;

        constructionManager.run();

        // Should be called for extension, but not for road
        assert.isTrue(roomMock.createConstructionSite.calledWith(sinon.match.any, STRUCTURE_EXTENSION));
        assert.isFalse(roomMock.createConstructionSite.calledWith(sinon.match.any, STRUCTURE_ROAD));

        lookForStub.restore();
    });

    it("main loop should cleanup constructionProjects memory", () => {
        ((global as any).Memory.rooms as any).W1N1 = { constructionProjects: {} };
        loop();
        assert.isUndefined((((global as any).Memory.rooms as any).W1N1 as any).constructionProjects);
    });

    describe("planPerimeter", () => {
        it("should re-plan on a planner version change, drop stale rampart sites, and place walls and gates", () => {
            const removed: any[] = [];
            const sites = [
                // Old all-rampart plan tile, nothing under it: stale.
                {
                    structureType: STRUCTURE_RAMPART,
                    pos: new MockRoomPosition(5, 5, "W1N1"),
                    remove: () => removed.push("5,5"),
                },
                // Rampart over our spawn comes from planRamparts and must survive.
                {
                    structureType: STRUCTURE_RAMPART,
                    pos: new MockRoomPosition(25, 25, "W1N1"),
                    remove: () => removed.push("25,25"),
                },
            ];
            const spawn = { structureType: STRUCTURE_SPAWN, my: true, pos: new MockRoomPosition(25, 25, "W1N1") };
            (sites[1].pos as any).lookFor = (look: string) => (look === LOOK_STRUCTURES ? [spawn] : []);

            roomMock.controller = { my: true, level: 4, pos: new MockRoomPosition(20, 20, "W1N1") };
            roomMock.getTerrain = () => ({ get: () => 0 });
            roomMock.find = sinon.stub().callsFake((type: number, opts?: any) => {
                if (type === FIND_MY_STRUCTURES) return opts?.filter ? [spawn].filter(opts.filter) : [spawn];
                if (type === FIND_STRUCTURES) return [spawn];
                if (type === FIND_CONSTRUCTION_SITES || type === FIND_MY_CONSTRUCTION_SITES) return sites;
                return [];
            });
            colonyMock.colonyInfo = {
                defenseManagement: {
                    nextUpdate: 0,
                    perimeter: [{ x: 5, y: 5 }],
                    lastPerimeterRcl: 4,
                },
            };

            (constructionManager as any).planPerimeter();

            expect(removed).to.deep.equal(["5,5"]);
            const perimeter = colonyMock.colonyInfo.defenseManagement.perimeter;
            expect(perimeter.length).to.be.greaterThan(0);
            expect(perimeter.some((t: any) => t.structureType === STRUCTURE_WALL)).to.equal(true);
            expect(perimeter.some((t: any) => t.structureType === STRUCTURE_RAMPART)).to.equal(true);
            expect(colonyMock.colonyInfo.defenseManagement.perimeterVersion).to.be.a("number");

            // Gates are placed first, five sites per pass.
            const placedTypes = roomMock.createConstructionSite.args.map((a: any[]) => a[1]);
            expect(placedTypes.length).to.equal(5);
            expect(placedTypes[0]).to.equal(STRUCTURE_RAMPART);
        });
    });
});
