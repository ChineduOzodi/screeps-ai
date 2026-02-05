import { assert } from "chai";
import { Game, Memory } from "../../test/utils/mock";
import { loop } from "../main";
import { EnergySystem } from "./energy-system";
import { ColonyManager } from "../prototypes/colony";

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
        } as any;

        mockColony = {
            getMainRoom: () => mockRoom,
            getPrimaryStorage: () => undefined,
            getCreepCount: () => 1, // Default to having creeps
            getCreeps: () => [], // Default to no alive creeps
            colonyInfo: {
                energyManagement: {},
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
});
