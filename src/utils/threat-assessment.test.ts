import { expect } from "chai";
import { ThreatAssessment } from "./threat-assessment";

describe("ThreatAssessment", () => {
    beforeEach(() => {
        (global as any).TOWER_POWER_ATTACK = 600;
        (global as any).TOWER_OPTIMAL_RANGE = 5;
        (global as any).TOWER_FALLOFF_RANGE = 20;
        (global as any).TOWER_FALLOFF = 0.75;
        (global as any).TOWER_ENERGY_COST = 10;
        (global as any).ATTACK_POWER = 30;
        (global as any).RANGED_ATTACK_POWER = 10;
        (global as any).HEAL_POWER = 12;
        (global as any).ATTACK = "attack";
        (global as any).RANGED_ATTACK = "ranged_attack";
        (global as any).HEAL = "heal";
        (global as any).RESOURCE_ENERGY = "energy";
    });

    describe("towerDamageAtRange", () => {
        it("should deal full damage at or below optimal range", () => {
            expect(ThreatAssessment.towerDamageAtRange(1)).to.equal(600);
            expect(ThreatAssessment.towerDamageAtRange(5)).to.equal(600);
        });

        it("should deal minimum damage at or beyond falloff range", () => {
            expect(ThreatAssessment.towerDamageAtRange(20)).to.equal(150);
            expect(ThreatAssessment.towerDamageAtRange(49)).to.equal(150);
        });

        it("should interpolate linearly between optimal and falloff range", () => {
            // Halfway (range 12.5 -> use 12): 600 - 600*0.75*(7/15) = 600 - 210 = 390
            expect(ThreatAssessment.towerDamageAtRange(12)).to.equal(600 - Math.ceil(600 * 0.75 * (7 / 15)));
        });
    });

    describe("selectTowerTarget", () => {
        const makeTower = (energy: number, range: number): any => ({
            store: { energy },
            pos: { getRangeTo: () => range },
        });

        const makeHostile = (opts: { heal?: number; hits?: number; near?: boolean }): any => ({
            id: `${Math.random()}`,
            hits: opts.hits ?? 1000,
            hitsMax: 1000,
            getActiveBodyparts: (part: string) => (part === "heal" ? opts.heal || 0 : 0),
            pos: { inRangeTo: () => opts.near ?? true },
        });

        it("should return null when no towers have energy", () => {
            const report = {
                hostiles: [makeHostile({})],
            } as any;
            expect(ThreatAssessment.selectTowerTarget([makeTower(0, 5)], report)).to.equal(null);
        });

        it("should return null when hostiles out-heal tower damage", () => {
            // Tower at max falloff range does 150; healer heals 50*12=600 > 150
            const healer = makeHostile({ heal: 50 });
            const report = { hostiles: [healer] } as any;
            expect(ThreatAssessment.selectTowerTarget([makeTower(1000, 25)], report)).to.equal(null);
        });

        it("should prefer healers over other hostiles", () => {
            const healer = makeHostile({ heal: 2 });
            const brawler = makeHostile({ hits: 100 });
            const report = { hostiles: [brawler, healer] } as any;
            const target = ThreatAssessment.selectTowerTarget([makeTower(1000, 5)], report);
            expect(target).to.equal(healer);
        });

        it("should pick a killable target at close range", () => {
            const hostile = makeHostile({});
            const report = { hostiles: [hostile] } as any;
            const target = ThreatAssessment.selectTowerTarget([makeTower(1000, 5)], report);
            expect(target).to.equal(hostile);
        });
    });

    describe("effectiveHealFor", () => {
        it("should sum the target's own heal and nearby hostiles' heal", () => {
            const target: any = {
                id: "t",
                getActiveBodyparts: (p: string) => (p === "heal" ? 2 : 0),
                pos: {},
            };
            const nearHealer: any = {
                id: "h1",
                getActiveBodyparts: (p: string) => (p === "heal" ? 3 : 0),
                pos: { inRangeTo: () => true },
            };
            // Target heals itself (2*12) + friend (3*12) = 60
            expect(ThreatAssessment.effectiveHealFor(target, [target, nearHealer])).to.equal(60);
        });
    });
});
