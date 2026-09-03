import { expect } from "chai";
import { BUCKET_CONSERVE, BUCKET_CRITICAL, BUCKET_SURPLUS, CpuBudget } from "./cpu-budget";

describe("CpuBudget", () => {
    let used = 0;

    beforeEach(() => {
        used = 0;
        (global as any).Game = {
            time: 1000,
            cpu: { limit: 20, bucket: 10000, tickLimit: 500, getUsed: () => used },
        };
        (global as any).Memory = {};
    });

    describe("planFor", () => {
        it("should burst past the limit when the bank is full", () => {
            const plan = CpuBudget.planFor({ limit: 20, bucket: 10000, tickLimit: 500 });
            expect(plan.mode).to.equal("surplus");
            expect(plan.target).to.equal(30);
            expect(plan.optional).to.equal(true);
        });

        it("should scale with the limit, not a fixed number", () => {
            const plan = CpuBudget.planFor({ limit: 100, bucket: 10000, tickLimit: 500 });
            expect(plan.target).to.equal(150);
        });

        it("should never plan past the tick limit", () => {
            const plan = CpuBudget.planFor({ limit: 100, bucket: 10000, tickLimit: 120 });
            expect(plan.target).to.be.at.most(120);
        });

        it("should spend exactly the limit with a healthy bank", () => {
            const plan = CpuBudget.planFor({ limit: 20, bucket: BUCKET_CONSERVE, tickLimit: 500 });
            expect(plan.mode).to.equal("normal");
            expect(plan.target).to.equal(20);
        });

        it("should conserve and stretch intervals as the bank drains", () => {
            const plan = CpuBudget.planFor({ limit: 20, bucket: BUCKET_CONSERVE - 1, tickLimit: 500 });
            expect(plan.mode).to.equal("conserve");
            expect(plan.target).to.equal(16);
            expect(plan.optional).to.equal(false);
            expect(plan.intervalScale).to.equal(2);
        });

        it("should go critical near an empty bank", () => {
            const plan = CpuBudget.planFor({ limit: 20, bucket: BUCKET_CRITICAL - 1, tickLimit: 500 });
            expect(plan.mode).to.equal("critical");
            expect(plan.target).to.equal(10);
            expect(plan.intervalScale).to.equal(5);
        });

        it("should treat the surplus threshold as inclusive", () => {
            expect(CpuBudget.planFor({ limit: 20, bucket: BUCKET_SURPLUS, tickLimit: 500 }).mode).to.equal("surplus");
        });
    });

    describe("tick helpers", () => {
        it("should stretch periodic intervals under pressure", () => {
            (global as any).Game.cpu.bucket = 3000;
            CpuBudget.startTick();
            (global as any).Game.time = 1010;
            expect(CpuBudget.every(10)).to.equal(false);
            (global as any).Game.time = 1020;
            expect(CpuBudget.every(10)).to.equal(true);
        });

        it("should keep the base interval when the bank is healthy", () => {
            CpuBudget.startTick();
            (global as any).Game.time = 1010;
            expect(CpuBudget.every(10)).to.equal(true);
        });

        it("should stop deferrable creeps once the reserve is reached", () => {
            (global as any).Game.cpu.bucket = 6000; // normal: target 20, reserve 3
            CpuBudget.startTick();
            used = 10;
            expect(CpuBudget.canRunDeferrable()).to.equal(true);
            used = 17.5;
            expect(CpuBudget.canRunDeferrable()).to.equal(false);
        });

        it("should turn visuals off when the user disables them", () => {
            CpuBudget.startTick();
            expect(CpuBudget.optionalAllowed()).to.equal(true);
            (global as any).Memory.settings = { visuals: false };
            expect(CpuBudget.optionalAllowed()).to.equal(false);
        });

        it("should record stats with phase costs and a running average", () => {
            CpuBudget.startTick();
            CpuBudget.measure("creeps", () => {
                used += 4;
            });
            CpuBudget.noteDeferredCreep();
            used = 12;
            CpuBudget.endTick();

            const stats = (global as any).Memory.stats.cpu;
            expect(stats.used).to.equal(12);
            expect(stats.mode).to.equal("surplus");
            expect(stats.deferredCreeps).to.equal(1);
            expect(stats.phases.creeps).to.equal(4);
            expect(stats.average).to.equal(12);

            used = 22;
            CpuBudget.endTick();
            expect((global as any).Memory.stats.cpu.average).to.equal(12.1);
        });

        it("should only spend the bank on a pixel when opted in", () => {
            let pixels = 0;
            (global as any).Game.cpu.generatePixel = () => pixels++;
            CpuBudget.startTick();
            CpuBudget.endTick();
            expect(pixels).to.equal(0);

            (global as any).Memory.settings = { generatePixels: true };
            CpuBudget.endTick();
            expect(pixels).to.equal(1);
        });
    });
});
