import { expect } from "chai";
import { computeEnergyBudget, ENERGY_DRAWDOWN_TICKS } from "./energy-budget";

describe("energy-budget", () => {
    it("spends 80% of income while the reserve is still being built", () => {
        const budget = computeEnergyBudget({
            productionRate: 20,
            storedEnergy: 5000,
            storedEnergyPercent: 0.005,
            reserve: 20000,
        });
        expect(budget.baseMultiplier).to.equal(0.8);
        expect(budget.surplus).to.equal(0);
        expect(budget.drawdownRate).to.equal(0);
        expect(budget.spendableRate).to.be.closeTo(16, 1e-9);
    });

    it("spends all of its income once the reserve is met", () => {
        const budget = computeEnergyBudget({
            productionRate: 20,
            storedEnergy: 20000,
            storedEnergyPercent: 0.02,
            reserve: 20000,
        });
        expect(budget.baseMultiplier).to.equal(1.0);
        expect(budget.spendableRate).to.be.closeTo(20, 1e-9);
    });

    it("releases a banked surplus over the drawdown window on top of income", () => {
        // 388k in a 1M store at RCL 4: the situation that left hundreds of thousands idle.
        const budget = computeEnergyBudget({
            productionRate: 24,
            storedEnergy: 388000,
            storedEnergyPercent: 0.388,
            reserve: 20000,
        });
        expect(budget.surplus).to.equal(368000);
        expect(budget.drawdownRate).to.be.closeTo(368000 / ENERGY_DRAWDOWN_TICKS, 1e-9);
        expect(budget.spendableRate).to.be.closeTo(24 + 368000 / ENERGY_DRAWDOWN_TICKS, 1e-9);
        expect(budget.spendableRate).to.be.greaterThan(100);
    });

    it("lets a surplus cover a negative net income instead of going below zero", () => {
        const budget = computeEnergyBudget({
            productionRate: -5,
            storedEnergy: 50000,
            storedEnergyPercent: 0.05,
            reserve: 20000,
        });
        expect(budget.spendableRate).to.be.closeTo(-5 + 30000 / ENERGY_DRAWDOWN_TICKS, 1e-9);

        const broke = computeEnergyBudget({
            productionRate: -5,
            storedEnergy: 0,
            storedEnergyPercent: 0,
            reserve: 20000,
        });
        expect(broke.spendableRate).to.equal(0);
    });

    it("keeps the nearly-full multipliers for small stores such as containers", () => {
        expect(
            computeEnergyBudget({ productionRate: 10, storedEnergy: 1900, storedEnergyPercent: 0.95, reserve: 0 })
                .baseMultiplier,
        ).to.equal(1.5);
        expect(
            computeEnergyBudget({ productionRate: 10, storedEnergy: 1700, storedEnergyPercent: 0.85, reserve: 0 })
                .baseMultiplier,
        ).to.equal(1.1);
    });
});
