import { assert } from "chai";
import sinon from "sinon";
import { ConstructionManager } from "./construction-manager";
import { ConstructionUtils } from "../utils/construction-utils";

class MockRoomPosition {
    public x: number;
    public y: number;
    public roomName: string;
    constructor(x: number, y: number, roomName: string) {
        this.x = x;
        this.y = y;
        this.roomName = roomName;
    }
    public lookFor(type: string): any[] {
        return [];
    }
}

describe("ConstructionManager.planExtensions", () => {
    let colonyMock: any;
    let roomMock: any;
    let spawnMock: any;
    let constructionManager: ConstructionManager;

    beforeEach(() => {
        // @ts-ignore
        global.Game = {
            time: 10,
            rooms: {},
        };
        // @ts-ignore
        global.Memory = {};
        // @ts-ignore
        global.RoomPosition = MockRoomPosition;
        // @ts-ignore
        global.STRUCTURE_EXTENSION = "extension";
        // @ts-ignore
        global.STRUCTURE_ROAD = "road";
        // @ts-ignore
        global.FIND_MY_STRUCTURES = 1;
        // @ts-ignore
        global.FIND_MY_CONSTRUCTION_SITES = 2;
        // @ts-ignore
        global.LOOK_STRUCTURES = "structures";
        // @ts-ignore
        global.LOOK_CONSTRUCTION_SITES = "constructionSites";
        // @ts-ignore
        global.OK = 0;
        // @ts-ignore
        global.CONTROLLER_STRUCTURES = {
            ["extension"]: {
                0: 0,
                1: 0,
                2: 5,
                3: 10,
                4: 20,
                5: 30,
                6: 40,
                7: 50,
                8: 60,
            },
        };

        spawnMock = {
            pos: new MockRoomPosition(25, 25, "W1N1"),
        };

        roomMock = {
            name: "W1N1",
            controller: { level: 2 },
            createConstructionSite: sinon.stub().returns(0),
            find: sinon.stub().returns([]),
        };

        colonyMock = {
            getMainRoom: () => roomMock,
            getMainSpawn: () => spawnMock,
        };

        constructionManager = new ConstructionManager(colonyMock);

        // Mock ConstructionUtils.isTileClearForStructure to always return true by default
        sinon.stub(ConstructionUtils, "isTileClearForStructure").returns(true);
    });

    afterEach(() => {
        sinon.restore();
    });

    it("should do nothing if we already have max extensions", () => {
        // RCL 2 allows 5 extensions
        roomMock.find.withArgs(1).returns(new Array(5)); // FIND_MY_STRUCTURES
        roomMock.find.withArgs(2).returns([]); // FIND_MY_CONSTRUCTION_SITES

        // Call private method using any cast
        (constructionManager as any).planExtensions();

        assert.isFalse(roomMock.createConstructionSite.called);
    });

    it("should place missing extensions up to the limit", () => {
        // RCL 2 allows 5 extensions. We have 2. Need 3.
        roomMock.find.withArgs(1).returns(new Array(2));
        roomMock.find.withArgs(2).returns([]);

        (constructionManager as any).planExtensions();

        // Should call createConstructionSite for 3 extensions
        const extensionCalls = roomMock.createConstructionSite.getCalls().filter((c: any) => c.args[1] === "extension");
        assert.equal(extensionCalls.length, 3);
    });

    it("should place roads for clusters that have extensions", () => {
        // RCL 2 allows 5 extensions. We have 0.
        roomMock.find.withArgs(1).returns([]);
        roomMock.find.withArgs(2).returns([]);

        (constructionManager as any).planExtensions();

        // 5 extensions should be placed.
        // Cluster candidates are tried. The first cluster has 5 extension spots.
        // If 5 extensions are placed in the first cluster, roads for that cluster should also be placed.
        const roadCalls = roomMock.createConstructionSite.getCalls().filter((c: any) => c.args[1] === "road");
        assert.isAbove(roadCalls.length, 0);
    });

    it("should skip positions that already have extensions or sites", () => {
        // RCL 2 allows 5. We have 0.
        roomMock.find.withArgs(1).returns([]);
        roomMock.find.withArgs(2).returns([]);

        // Mock lookFor to return something for the first position
        const lookForStub = sinon.stub(MockRoomPosition.prototype, "lookFor");
        // For the very first extension position in the first cluster (delta 0, -4, offset 0,0)
        // Pos: 25, 21
        lookForStub.callsFake(function (this: MockRoomPosition, type: string) {
            if (this.x === 25 && this.y === 21 && type === "structures") {
                return [{ structureType: "extension" }];
            }
            return [];
        });

        (constructionManager as any).planExtensions();

        // It should skip 25,21 and place 5 others (if available in candidates)
        // Note: our logic skips 25,21 but it increments placedInCluster, so roads are still placed.
        // And it needs 5.
        const extensionCalls = roomMock.createConstructionSite.getCalls().filter((c: any) => c.args[1] === "extension");
        assert.equal(extensionCalls.length, 5);

        // Ensure 25,21 was NOT called
        extensionCalls.forEach((call: any) => {
            const pos = call.args[0];
            assert.isFalse(pos.x === 25 && pos.y === 21);
        });
    });

    it("should skip invalid positions (out of bounds)", () => {
        // Move spawn to edge
        spawnMock.pos = new MockRoomPosition(2, 2, "W1N1");

        roomMock.find.withArgs(1).returns([]);
        roomMock.find.withArgs(2).returns([]);

        (constructionManager as any).planExtensions();

        // Many cluster candidates will be < 2 or > 47 and should be skipped.
        // We just ensure it doesn't crash and places some extensions if possible.
        const extensionCalls = roomMock.createConstructionSite.getCalls().filter((c: any) => c.args[1] === "extension");
        assert.isAtLeast(extensionCalls.length, 1);
    });

    it("should stop placing once needed count reaches 0", () => {
        // RCL 3 allows 10. We have 0.
        roomMock.controller.level = 3;
        roomMock.find.withArgs(1).returns([]);
        roomMock.find.withArgs(2).returns([]);

        (constructionManager as any).planExtensions();

        const extensionCalls = roomMock.createConstructionSite.getCalls().filter((c: any) => c.args[1] === "extension");
        assert.equal(extensionCalls.length, 10);
    });
});
