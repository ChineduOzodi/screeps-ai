import { CombatBody } from "./combat-body";
import { expect } from "chai";

describe("CombatBody", () => {
    const cost = (body: BodyPartConstant[]) => CombatBody.cost(body);
    const countOf = (body: BodyPartConstant[], part: BodyPartConstant) => body.filter(p => p === part).length;

    describe("layout", () => {
        it("puts every TOUGH part first so armor absorbs damage for the rest", () => {
            const body = CombatBody.layout(ATTACK, { tough: 3, move: 4, action: 4, heal: 1 });
            expect(body.slice(0, 3)).to.deep.equal([TOUGH, TOUGH, TOUGH]);
            expect(body.indexOf(TOUGH, 3)).to.equal(-1);
        });

        it("puts HEAL parts last so self-sustain is the last thing lost", () => {
            const body = CombatBody.layout(ATTACK, { tough: 2, move: 4, action: 4, heal: 2 });
            expect(body.slice(-2)).to.deep.equal([HEAL, HEAL]);
        });

        it("keeps MOVE parts in the tail so a wounded creep can still move", () => {
            const body = CombatBody.layout(ATTACK, { tough: 4, move: 10, action: 8, heal: 1 });
            // The last quarter of the body (weapons end) must still contain mobility.
            const tail = body.slice(Math.floor(body.length * 0.75));
            expect(countOf(tail, MOVE)).to.be.greaterThan(0);
        });

        it("leads with most of the MOVE parts as damage padding for the weapons", () => {
            const body = CombatBody.layout(ATTACK, { tough: 2, move: 10, action: 8, heal: 0 });
            const firstAttack = body.indexOf(ATTACK);
            const leadMove = countOf(body.slice(0, firstAttack), MOVE);
            expect(leadMove).to.be.greaterThan(10 / 2);
        });

        it("emits exactly the requested part counts", () => {
            const body = CombatBody.layout(RANGED_ATTACK, { tough: 2, move: 7, action: 5, heal: 1 });
            expect(countOf(body, TOUGH)).to.equal(2);
            expect(countOf(body, MOVE)).to.equal(7);
            expect(countOf(body, RANGED_ATTACK)).to.equal(5);
            expect(countOf(body, HEAL)).to.equal(1);
        });
    });

    describe("compose", () => {
        it("never exceeds the 50 part limit, however rich the colony is", () => {
            const body = CombatBody.build(ATTACK, 100000, CombatBody.MELEE_RATIO);
            expect(body.length).to.be.at.most(CombatBody.MAX_PARTS);
        });

        it("stays inside the energy budget", () => {
            for (const energy of [300, 550, 800, 1300, 2500]) {
                const body = CombatBody.build(ATTACK, energy, CombatBody.MELEE_RATIO);
                expect(cost(body), `budget ${energy}`).to.be.at.most(energy);
            }
        });

        it("still produces a usable body when a full unit is unaffordable", () => {
            const body = CombatBody.build(ATTACK, 300, CombatBody.MELEE_RATIO);
            expect(body.length).to.be.greaterThan(0);
            expect(countOf(body, ATTACK)).to.be.greaterThan(0);
            expect(countOf(body, MOVE)).to.be.greaterThan(0);
        });

        it("keeps at least one MOVE per non-MOVE part pair so the creep is not crippled", () => {
            const body = CombatBody.build(ATTACK, 2500, CombatBody.MELEE_RATIO);
            const moves = countOf(body, MOVE);
            const others = body.length - moves;
            expect(moves * 2).to.be.at.least(others);
        });

        it("spends leftover energy on extra weapon/move pairs", () => {
            const tight = CombatBody.build(ATTACK, 840, CombatBody.MELEE_RATIO);
            const loose = CombatBody.build(ATTACK, 840 + 400, CombatBody.MELEE_RATIO);
            expect(loose.length).to.be.greaterThan(tight.length);
        });

        it("gives melee defenders HEAL parts so they can patch themselves mid-fight", () => {
            const body = CombatBody.build(ATTACK, 2500, CombatBody.MELEE_RATIO);
            expect(countOf(body, HEAL)).to.be.greaterThan(0);
            expect(body[body.length - 1]).to.equal(HEAL);
        });

        it("does not add redundant HEAL parts to a healer body", () => {
            const body = CombatBody.build(HEAL, 2000, CombatBody.HEALER_RATIO);
            expect(countOf(body, HEAL)).to.be.greaterThan(0);
            expect(countOf(body, ATTACK)).to.equal(0);
            expect(cost(body)).to.be.at.most(2000);
        });
    });
});
