import { expect } from "chai";
import { EnergyCalculator } from "./energy-calculator";

describe("EnergyCalculator", () => {
    describe("calculateMoveSpeed", () => {
        it("should return 1 for a creep with 1 MOVE and 0 weight", () => {
            const body = [MOVE];
            const speed = EnergyCalculator.calculateMoveSpeed(body, false, true);
            expect(speed).to.equal(1);
        });

        it("should return 1 for a balanced creep on road (1 MOVE per 1 part)", () => {
            // [WORK, MOVE] -> Weight 1 (Work) * 1 (Road) = 1. Red 2. 1 <= 2. Speed 1.
            const body = [WORK, MOVE];
            const speed = EnergyCalculator.calculateMoveSpeed(body, false, true);
            expect(speed).to.equal(1);
        });

        it("should return 1 for 1 MOVE per 2 parts on road", () => {
            // [WORK, CARRY, MOVE] -> Weight 2. Red 2. 2 <= 2. Speed 1.
            // Loaded: CARRY has weight.
            const body = [WORK, CARRY, MOVE];
            const speed = EnergyCalculator.calculateMoveSpeed(body, true, true);
            expect(speed).to.equal(1);
        });

        it("should return 2 for heavy creep on road", () => {
            // [WORK, WORK, WORK, MOVE] -> Weight 3. Red 2. 3/2 = 1.5 -> 2.
            const body = [WORK, WORK, WORK, MOVE];
            const speed = EnergyCalculator.calculateMoveSpeed(body, false, true);
            expect(speed).to.equal(2);
        });

        it("should ignore CARRY weight when not loaded", () => {
            // [CARRY, CARRY, MOVE]
            // Loaded: Weight 2. Red 2. Speed 1.
            // Empty: Weight 0. Red 2. Speed 1.

            // Let's try [WORK, CARRY, CARRY, MOVE]
            // Empty: Weight 1 (WORK). Red 2. Speed 1.
            // Loaded: Weight 3. Red 2. Speed 2.
            const body = [WORK, CARRY, CARRY, MOVE];
            expect(EnergyCalculator.calculateMoveSpeed(body, false, true)).to.equal(1);
            expect(EnergyCalculator.calculateMoveSpeed(body, true, true)).to.equal(2);
        });

        it("should handle plain movement (2x fatigue)", () => {
            // [WORK, MOVE] on plain
            // Weight 1. Fatigue 1*2 = 2. Red 2. Speed 1.
            const body1 = [WORK, MOVE];
            expect(EnergyCalculator.calculateMoveSpeed(body1, false, false)).to.equal(1);

            // [WORK, CARRY, MOVE] on plain
            // Empty: Weight 1. Fatigue 2. Red 2. Speed 1.
            // Loaded: Weight 2. Fatigue 4. Red 2. Speed 2.
            const body2 = [WORK, CARRY, MOVE];
            expect(EnergyCalculator.calculateMoveSpeed(body2, false, false)).to.equal(1);
            expect(EnergyCalculator.calculateMoveSpeed(body2, true, false)).to.equal(2);
        });
    });

    describe("calculateHarvesterProductionPerTick", () => {
        it("should calculate production correctly", () => {
            // Just verify it runs and returns a number
            const body = [WORK, CARRY, MOVE];
            const rate = EnergyCalculator.calculateHarvesterProductionPerTick(body, 5, 5);
            expect(rate).to.be.greaterThan(0);
        });
    });
});
