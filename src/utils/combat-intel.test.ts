import { CombatIntel } from "./combat-intel";
import { expect } from "chai";

interface FakeCreepOptions {
    x: number;
    y: number;
    attack?: number;
    ranged?: number;
    heal?: number;
    work?: number;
    claim?: number;
    hits?: number;
    hitsMax?: number;
    id?: string;
}

/** Minimal creep stand-in: chebyshev ranges, part counts, hit points. */
const makePos = (x: number, y: number): any => ({
    x,
    y,
    roomName: "E1S1",
    getRangeTo(other: any) {
        return Math.max(Math.abs(this.x - other.x), Math.abs(this.y - other.y));
    },
    inRangeTo(other: any, range: number) {
        return this.getRangeTo(other.pos ?? other) <= range;
    },
});

let nextId = 0;
const makeCreep = (opts: FakeCreepOptions): any => ({
    id: opts.id ?? `creep-${nextId++}`,
    hits: opts.hits ?? 1000,
    hitsMax: opts.hitsMax ?? 1000,
    pos: makePos(opts.x, opts.y),
    getActiveBodyparts(part: string) {
        if (part === ATTACK) return opts.attack ?? 0;
        if (part === RANGED_ATTACK) return opts.ranged ?? 0;
        if (part === HEAL) return opts.heal ?? 0;
        if (part === WORK) return opts.work ?? 0;
        if (part === CLAIM) return opts.claim ?? 0;
        return 0;
    },
});

describe("CombatIntel", () => {
    describe("damageAtRange", () => {
        it("counts melee damage only where an attacker could step into contact", () => {
            const melee = makeCreep({ x: 0, y: 0, attack: 10 });
            expect(CombatIntel.damageAtRange(melee, 1)).to.equal(10 * ATTACK_POWER);
            expect(CombatIntel.damageAtRange(melee, 2)).to.equal(10 * ATTACK_POWER);
            expect(CombatIntel.damageAtRange(melee, 3)).to.equal(0);
        });

        it("counts ranged damage out to where a shooter could step and fire", () => {
            const shooter = makeCreep({ x: 0, y: 0, ranged: 5 });
            expect(CombatIntel.damageAtRange(shooter, 4)).to.equal(5 * RANGED_ATTACK_POWER);
            expect(CombatIntel.damageAtRange(shooter, 5)).to.equal(0);
        });
    });

    describe("incomingDamageAt", () => {
        it("sums what every hostile in reach can do to the tile", () => {
            const hostiles = [
                makeCreep({ x: 10, y: 10, attack: 5 }),
                makeCreep({ x: 13, y: 10, ranged: 4 }),
                makeCreep({ x: 40, y: 40, attack: 20 }),
            ];
            const damage = CombatIntel.incomingDamageAt(makePos(11, 10), hostiles);
            expect(damage).to.equal(5 * ATTACK_POWER + 4 * RANGED_ATTACK_POWER);
        });

        it("can ignore one hostile, for pricing the fight around a chosen target", () => {
            const target = makeCreep({ x: 10, y: 10, attack: 5 });
            const damage = CombatIntel.incomingDamageAt(makePos(11, 10), [target], target);
            expect(damage).to.equal(0);
        });
    });

    describe("selectTarget", () => {
        it("prefers a healer over a harmless creep at the same distance", () => {
            const healer = makeCreep({ x: 12, y: 10, heal: 5 });
            const scout = makeCreep({ x: 8, y: 10 });
            const target = CombatIntel.selectTarget(makePos(10, 10), [healer, scout]);
            expect(target).to.equal(healer);
        });

        it("does not walk past a dangerous attacker to poke the weakest hostile", () => {
            // The weak creep is parked inside the attacker's reach; the attacker is alone.
            const attacker = makeCreep({ x: 20, y: 10, attack: 20 });
            const bait = makeCreep({ x: 21, y: 10, attack: 1, hits: 100, hitsMax: 1000 });
            const target = CombatIntel.selectTarget(makePos(10, 10), [attacker, bait]);
            expect(target).to.equal(attacker);
        });

        it("skips a target the squad cannot out-damage", () => {
            // The tank out-heals our damage; the soft target stands outside its heal range.
            const tank = makeCreep({ x: 11, y: 10, attack: 10, heal: 30 });
            const soft = makeCreep({ x: 18, y: 10, attack: 2 });
            const target = CombatIntel.selectTarget(makePos(10, 10), [tank, soft], { squadDamage: 100 });
            expect(target).to.equal(soft);
        });

        it("returns null when there is nothing to shoot", () => {
            expect(CombatIntel.selectTarget(makePos(10, 10), [])).to.equal(null);
        });
    });

    describe("mostDangerousInRange", () => {
        it("picks the biggest threat already in contact", () => {
            const me = makeCreep({ x: 10, y: 10 });
            const weak = makeCreep({ x: 11, y: 10, attack: 1 });
            const strong = makeCreep({ x: 9, y: 10, attack: 12 });
            const far = makeCreep({ x: 20, y: 10, attack: 40 });
            expect(CombatIntel.mostDangerousInRange(me, [weak, strong, far], 1)).to.equal(strong);
        });

        it("returns null when nothing is in range", () => {
            const me = makeCreep({ x: 10, y: 10 });
            expect(CombatIntel.mostDangerousInRange(me, [makeCreep({ x: 20, y: 20, attack: 5 })], 1)).to.equal(null);
        });
    });

    describe("shouldMassAttack", () => {
        it("is worth it when several hostiles are packed in close", () => {
            const me = makeCreep({ x: 10, y: 10 });
            const swarm = [makeCreep({ x: 11, y: 10 }), makeCreep({ x: 10, y: 11 }), makeCreep({ x: 9, y: 10 })];
            expect(CombatIntel.shouldMassAttack(me, swarm)).to.equal(true);
        });

        it("is not worth it against a single distant hostile", () => {
            const me = makeCreep({ x: 10, y: 10 });
            expect(CombatIntel.shouldMassAttack(me, [makeCreep({ x: 13, y: 10 })])).to.equal(false);
        });
    });

    describe("groupPower", () => {
        it("counts damage and healing together", () => {
            const group = [makeCreep({ x: 1, y: 1, attack: 5 }), makeCreep({ x: 2, y: 2, heal: 3 })];
            expect(CombatIntel.groupPower(group)).to.equal(5 * ATTACK_POWER + 3 * HEAL_POWER);
        });
    });
});
