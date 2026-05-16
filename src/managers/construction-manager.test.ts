import { assert } from "chai";
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
            controller: { my: true },
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
});
