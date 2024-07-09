import {assert} from "chai";
import {Game, Memory} from "./mock";

import {loop} from "../../src/main";
import { EnergyTrackingImpl } from "systems/energy-system";

describe("energy-system", () => {

  let energyTrackingInfo: EnergyTrackingInfo = {}

  before(() => {
    // runs before all test in this block
  });

  beforeEach(() => {
    // runs before each test in this block
    // @ts-ignore : allow adding Game to global
    global.Game = _.clone(Game);
    // @ts-ignore : allow adding Memory to global
    global.Memory = _.clone(Memory);
    loop();
    energyTrackingInfo = {};
  });

  describe("EnergyTrackingImpl", () => {
    it("should properly average partial ticks", () => {
      const energyTracking = new EnergyTrackingImpl(energyTrackingInfo, 10);
      const energyTicks = [1,2,3,4,5];
      for (const energy of energyTicks) {
        energyTracking.onTickFlow(energy);
      }
      const expectedAverage = energyTicks.reduce((a,b) => a+b,0)/energyTicks.length;
      assert.equal(energyTracking.getAverageEnergyFlow(), expectedAverage);
      assert.equal(energyTrackingInfo.average, expectedAverage, "average in memory not equal to expected.");
    });

    it("should properly average all ticks", () => {
      const energyTracking = new EnergyTrackingImpl(energyTrackingInfo, 5);
      const energyTicks = [1,2,3,4,5];
      for (const energy of energyTicks) {
        energyTracking.onTickFlow(energy);
      }
      const expectedAverage = energyTicks.reduce((a,b) => a+b,0)/energyTicks.length;
      assert.equal(energyTracking.getAverageEnergyFlow(), expectedAverage);
      assert.equal(energyTrackingInfo.average, expectedAverage, "average in memory not equal to expected.");
    });

    it("should rolling average ticks", () => {
      const energyTracking = new EnergyTrackingImpl(energyTrackingInfo, 5);
      const energyTicks = [4,5,2,4,5,5,1,2,3,4,5];
      for (const energy of energyTicks) {
        energyTracking.onTickFlow(energy);
      }
      assert.equal(energyTracking.getAverageEnergyFlow(), 3);
      assert.equal(energyTrackingInfo.average, 3, "average in memory not equal to expected.");
    });
  })


});
