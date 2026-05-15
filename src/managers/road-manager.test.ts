import { assert } from "chai";
import { RoadManager } from "./road-manager";
import { Game, Memory } from "../../test/utils/mock";
import { ColonyManager } from "../prototypes/types";

describe("RoadManager", () => {
    let roadManager: RoadManager;
    let mockColony: any;
    let mockRoom: any;

    beforeEach(() => {
        // @ts-ignore
        global.Game = _.clone(Game);
        // @ts-ignore
        global.Memory = _.clone(Memory);
        // @ts-ignore
        global.STRUCTURE_ROAD = "road";
        // @ts-ignore
        global.LOOK_STRUCTURES = "structure";
        // @ts-ignore
        global.LOOK_CONSTRUCTION_SITES = "constructionSite";
        // @ts-ignore
        global.TERRAIN_MASK_SWAMP = 2;
        // @ts-ignore
        global.TERRAIN_MASK_WALL = 1;
        // @ts-ignore
        global.FIND_SOURCES = 105;
        // @ts-ignore
        global.FIND_STRUCTURES = 107;
        // @ts-ignore
        global.FIND_CONSTRUCTION_SITES = 111;

        mockRoom = {
            name: "W1N1",
            find: (type: number) => [],
            getTerrain: () => ({
                get: (x: number, y: number) => 0,
            }),
            createConstructionSite: () => 0,
        };

        // @ts-ignore
        global.Game.rooms = {
            W1N1: mockRoom,
        };

        mockColony = {
            getMainRoom: () => mockRoom,
            getMainSpawn: () => ({ pos: { x: 25, y: 25, roomName: "W1N1" } }),
            colonyInfo: {
                rooms: [{ name: "W1N1" }],
                infrastructureManagement: {
                    nextUpdate: 0,
                },
            },
            constructionManager: {
                deleteProject: () => {},
            },
        };

        roadManager = new RoadManager(mockColony as any);
    });

    describe("updateRoadStats", () => {
        it("should calculate total cost for roads on different terrains", () => {
            const roads = [
                { pos: { x: 10, y: 10 }, structureType: "road" }, // Plain
                { pos: { x: 11, y: 11 }, structureType: "road" }, // Swamp
                { pos: { x: 12, y: 12 }, structureType: "road" }, // Wall
            ];

            mockRoom.find = (type: number) => {
                if (type === (global as any).FIND_STRUCTURES) return roads;
                return [];
            };

            mockRoom.getTerrain = () => ({
                get: (x: number, y: number) => {
                    if (x === 10 && y === 10) return 0; // Plain
                    if (x === 11 && y === 11) return (global as any).TERRAIN_MASK_SWAMP;
                    if (x === 12 && y === 12) return (global as any).TERRAIN_MASK_WALL;
                    return 0;
                },
            });

            roadManager.updateRoadStats();

            const stats = mockColony.colonyInfo.infrastructureManagement;
            assert.equal(stats.roadCount, 3);
            assert.equal(stats.roadMaintenanceCost, 1 + 5 + 150);
        });

        it("should respect the 100 tick check interval", () => {
            mockColony.colonyInfo.infrastructureManagement.lastRoadMaintenanceCheck = 500;
            // @ts-ignore
            global.Game.time = 550;

            roadManager.updateRoadStats();

            // Should NOT have updated (null because we didn't mock find yet)
            assert.isUndefined(mockColony.colonyInfo.infrastructureManagement.roadCount);

            // @ts-ignore
            global.Game.time = 601;
            roadManager.updateRoadStats();
            assert.isDefined(mockColony.colonyInfo.infrastructureManagement.roadCount);
        });
    });

    describe("areColonyRoadsBuilt", () => {
        it("should return true if no road construction sites exist", () => {
            mockRoom.find = (type: number) => [];
            assert.isTrue(roadManager.areColonyRoadsBuilt());
        });

        it("should return false if road construction sites exist", () => {
            mockRoom.find = (type: number) => [{ structureType: "road" }];
            assert.isFalse(roadManager.areColonyRoadsBuilt());
        });
    });
});
