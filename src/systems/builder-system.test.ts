import { BuilderSystem } from "./builder-system";
import { ColonyManagerImpl } from "../prototypes/colony";
import { Game, Memory } from "../../test/utils/mock";
import { assert } from "chai";
import * as _ from "lodash";

describe("BuilderSystem", () => {
    beforeEach(() => {
        // @ts-expect-error : allow adding Game to global
        global.Game = _.cloneDeep(Game);
        // @ts-expect-error : allow adding Memory to global
        global.Memory = _.cloneDeep(Memory);
    });

    it("should prioritize extensions over roads in buildQueue", () => {
        const colonyInfo = {
            rooms: { E1S1: {} },
            builderManagement: {
                buildQueue: [],
            },
        } as any;
        const colony = new ColonyManagerImpl(colonyInfo);
        const system = new BuilderSystem(colony);

        const roadSite = {
            id: "road_1" as Id<ConstructionSite>,
            structureType: STRUCTURE_ROAD,
            room: { name: "E1S1" },
            progress: 0,
        };
        const extensionSite = {
            id: "extension_1" as Id<ConstructionSite>,
            structureType: STRUCTURE_EXTENSION,
            room: { name: "E1S1" },
            progress: 0,
        };

        // Mock Game.constructionSites
        (global.Game as any).constructionSites = {
            road_1: roadSite,
            extension_1: extensionSite,
        };

        // @ts-ignore - access private method for testing
        system.updateBuildQueue();

        const queue = colonyInfo.builderManagement.buildQueue;
        assert.equal(queue[0], "extension_1", "Extension should be first in queue");
        assert.equal(queue[1], "road_1", "Road should be second in queue");
    });

    it("should prioritize towers over extensions", () => {
        const colonyInfo = {
            rooms: { E1S1: {} },
            builderManagement: {
                buildQueue: [],
            },
        } as any;
        const colony = new ColonyManagerImpl(colonyInfo);
        const system = new BuilderSystem(colony);

        const towerSite = {
            id: "tower_1" as Id<ConstructionSite>,
            structureType: STRUCTURE_TOWER,
            room: { name: "E1S1" },
            progress: 0,
        };
        const extensionSite = {
            id: "extension_1" as Id<ConstructionSite>,
            structureType: STRUCTURE_EXTENSION,
            room: { name: "E1S1" },
            progress: 0,
        };

        // Mock Game.constructionSites
        (global.Game as any).constructionSites = {
            extension_1: extensionSite,
            tower_1: towerSite,
        };

        // @ts-ignore - access private method for testing
        system.updateBuildQueue();

        const queue = colonyInfo.builderManagement.buildQueue;
        assert.equal(queue[0], "tower_1", "Tower should be first in queue");
        assert.equal(queue[1], "extension_1", "Extension should be second in queue");
    });

    it("should prioritize sites with more progress if structure types are the same", () => {
        const colonyInfo = {
            rooms: { E1S1: {} },
            builderManagement: {
                buildQueue: [],
            },
        } as any;
        const colony = new ColonyManagerImpl(colonyInfo);
        const system = new BuilderSystem(colony);

        const extension1 = {
            id: "extension_1" as Id<ConstructionSite>,
            structureType: STRUCTURE_EXTENSION,
            room: { name: "E1S1" },
            progress: 10,
        };
        const extension2 = {
            id: "extension_2" as Id<ConstructionSite>,
            structureType: STRUCTURE_EXTENSION,
            room: { name: "E1S1" },
            progress: 50,
        };

        // Mock Game.constructionSites
        (global.Game as any).constructionSites = {
            extension_1: extension1,
            extension_2: extension2,
        };

        // @ts-ignore - access private method for testing
        system.updateBuildQueue();

        const queue = colonyInfo.builderManagement.buildQueue;
        assert.equal(queue[0], "extension_2", "Extension with more progress should be first");
        assert.equal(queue[1], "extension_1", "Extension with less progress should be second");
    });
});
