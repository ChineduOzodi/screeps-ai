import { Game, Memory } from "./mock";

import { EnergyTrackingImpl } from "systems/energy-tracking";
import { assert } from "chai";
import { loop } from "../../src/main";

describe("energy-system", () => {
    let energyTrackingInfo: EnergyTrackingInfo = {};

    before(() => {
        // runs before all test in this block
    });

    beforeEach(() => {
        // runs before each test in this block
        // @ts-expect-error : allow adding Game to global
        global.Game = _.clone(Game);
        // @ts-expect-error : allow adding Memory to global
        global.Memory = _.clone(Memory);
        loop();
        energyTrackingInfo = {};
    });

    describe("EnergyTrackingImpl", () => {
        it("should properly average all ticks", () => {
            const energyTracking = new EnergyTrackingImpl(energyTrackingInfo);
            const energyTicks = [1, 2, 3, 4, 5];
            for (const energy of energyTicks) {
                energyTracking.onTickFlow(energy);
            }
            const expectedAverage = energyTicks.reduce((a, b) => a + b, 0) / energyTicks.length;
            assert.equal(energyTracking.getAverageEnergyFlow(), expectedAverage);
            assert.equal(energyTrackingInfo.average, expectedAverage, "average in memory not equal to expected.");
        });

        it("should average 10 ticks", () => {
            const energyTracking = new EnergyTrackingImpl(energyTrackingInfo);
            const energyTicks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            for (const energy of energyTicks) {
                energyTracking.onTickFlow(energy);
            }
            const expectedAverage = energyTicks.reduce((a, b) => a + b, 0) / energyTicks.length;
            assert.equal(energyTracking.getAverageEnergyFlow(), expectedAverage);
            assert.equal(energyTrackingInfo.average, expectedAverage, "average in memory not equal to expected.");
        });
    });
});
