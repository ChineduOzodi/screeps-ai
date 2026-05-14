import { assert } from "chai";
import { Game, Memory } from "../../test/utils/mock";
import { loop } from "../main";
import { EnergySystem } from "./energy-system";
import { ColonyManager } from "../prototypes/types";

describe("Energy System", () => {
    let mockColony: ColonyManager;

    beforeEach(() => {
        // @ts-ignore : allow adding Game to global
        global.Game = _.clone(Game);
        // @ts-ignore : allow adding Memory to global
        global.Memory = _.clone(Memory);
        loop();

        const mockRoom = {
            energyCapacityAvailable: 300,
            energyAvailable: 300,
            find: () => [],
            memory: {},
            visual: {
                text: () => {},
                rect: () => {},
                circle: () => {},
            },
        } as any;

        mockColony = {
            getMainRoom: () => mockRoom,
            getMainSpawn: () => undefined,
            getPrimaryStorage: () => undefined,
            getCreepCount: () => 1, // Default to having creeps
            getCreeps: () => [], // Default to no alive creeps
            getSpawnQueue: () => [],
            colonyInfo: {
                energyManagement: {
                    sources: [],
                },
            },
        } as any;
    });

    it("should use miners when storage exists and capacity is high enough", () => {
        const energySystem = new EnergySystem(mockColony);
        const room = mockColony.getMainRoom();

        // Mock storage
        mockColony.getPrimaryStorage = () => ({ id: "storage" }) as any;
        // Mock capacity
        Object.defineProperty(room, "energyCapacityAvailable", { value: 550, configurable: true });

        // Mock alive harvester so we don't trigger emergency fallback
        mockColony.getCreeps = () => [{ memory: { role: "harvester" } } as any];

        assert.isTrue(energySystem.shouldUseMiners());
    });

    it("should NOT use miners if no ALIVE energy collectors exist, even if one is in queue", () => {
        const energySystem = new EnergySystem(mockColony);
        const room = mockColony.getMainRoom();

        // Mock storage & capacity
        mockColony.getPrimaryStorage = () => ({ id: "storage" }) as any;
        Object.defineProperty(room, "energyCapacityAvailable", { value: 550, configurable: true });

        // Mock queued miner (getRoleCount includes queue)
        energySystem.getRoleCount = () => 1;

        // Mock no alive creeps
        mockColony.getCreeps = () => [];

        assert.isFalse(
            energySystem.shouldUseMiners(),
            "Should return false to fallback to harvesters when only queued collectors exist",
        );
    });

    it("should include Miner and Carrier production in theoretical gross production", () => {
        const energySystem = new EnergySystem(mockColony);

        // Mock 1 Source
        const mockSource = {
            id: "source1",
            pos: {
                x: 10,
                y: 10,
                roomName: "W1N1",
                findPathTo: () => ({ length: 10 }),
                findClosestByPath: () => null,
            },
            room: {
                getTerrain: () => ({ get: () => 0 }),
            },
        } as any;

        const mockRoom = mockColony.getMainRoom();
        mockRoom.find = (type: number) => (type === FIND_SOURCES ? [mockSource] : []);

        // Mock System Info sources directly in colonyInfo to avoid setSources trigger
        (mockColony as any).colonyInfo.energyManagement.sources = [
            {
                sourceId: "source1" as any,
                accessCount: 1,
                position: mockSource.pos,
                miningPosition: { x: 11, y: 11, roomName: "W1N1" } as any,
            },
        ];

        // Mock 1 Miner and 1 Carrier
        const miner = {
            memory: { role: "miner", workTargetId: "source1" },
            body: [WORK, WORK, WORK, WORK, WORK, MOVE],
        } as any;
        const carrier = {
            memory: { role: "carrier", workTargetId: "source1" },
            body: [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE],
        } as any;

        mockColony.getCreeps = () => [miner, carrier];
        mockColony.getSpawnQueue = () => [];

        // Mock Game.getObjectById
        global.Game.getObjectById = (id: string) => (id === "source1" ? mockSource : null) as any;

        // Mock distances for production calculation
        // getTheoreticalGrossProduction uses EnergyCalculator.calculateTravelTime(target.pos, source.pos)
        // target is either extension/spawn found by findClosestByPath or mainSpawn
        const mockSpawn = {
            pos: {
                x: 5,
                y: 5,
                roomName: "W1N1",
                findPathTo: () => ({ length: 10 }),
            },
        } as any;
        mockColony.getMainSpawn = () => mockSpawn;

        // Mock findClosestByPath to return the spawn
        mockSource.pos.findClosestByPath = () => mockSpawn;

        const production = energySystem.getTheoreticalGrossProduction();

        assert.isAbove(
            production,
            1,
            "Theoretical gross production should include Miner/Carrier and be greater than base 1",
        );
    });
});
