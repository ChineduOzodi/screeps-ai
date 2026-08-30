import "prototypes/colony.extensions";
import "prototypes/memory.extensions";
import "prototypes/creep.extensions";
import { CreepRole } from "prototypes/types";
import { Squad, SquadCoordinator } from "./squad-coordinator";
import { expect } from "chai";

const baseInput = {
    ourPower: 0,
    hostilePower: 100,
    wasEngaged: false,
    coreBreached: false,
    structuresUnderAttack: false,
    inContact: false,
    civiliansUnderAttack: false,
};

const makeMember = (role: CreepRole, hits: number, hitsMax: number, x: number, id: string): any => ({
    id,
    hits,
    hitsMax,
    memory: { role },
    pos: {
        x,
        y: 10,
        getRangeTo(other: any) {
            return Math.abs(this.x - (other.x ?? other.pos.x));
        },
    },
});

describe("SquadCoordinator", () => {
    describe("shouldEngage", () => {
        it("holds back when the squad is weaker than the attackers", () => {
            expect(SquadCoordinator.shouldEngage({ ...baseInput, ourPower: 50 })).to.equal(false);
        });

        it("commits once the squad can match the attackers", () => {
            expect(SquadCoordinator.shouldEngage({ ...baseInput, ourPower: 80 })).to.equal(true);
        });

        it("keeps fighting after committing until it is clearly losing, so it does not flip-flop", () => {
            const engaged = { ...baseInput, ourPower: 60, wasEngaged: true };
            expect(SquadCoordinator.shouldEngage(engaged)).to.equal(true);
            expect(SquadCoordinator.shouldEngage({ ...engaged, ourPower: 40 })).to.equal(false);
        });

        it("always fights when hostiles reach the base core", () => {
            expect(SquadCoordinator.shouldEngage({ ...baseInput, ourPower: 1, coreBreached: true })).to.equal(true);
        });

        it("always fights while our buildings are being attacked", () => {
            expect(SquadCoordinator.shouldEngage({ ...baseInput, ourPower: 1, structuresUnderAttack: true })).to.equal(
                true,
            );
        });

        it("fights rather than turning its back on a hostile already in contact", () => {
            expect(SquadCoordinator.shouldEngage({ ...baseInput, ourPower: 1, inContact: true })).to.equal(true);
        });

        it("fights when raiders are cutting down our workers, who cannot defend themselves", () => {
            expect(SquadCoordinator.shouldEngage({ ...baseInput, ourPower: 1, civiliansUnderAttack: true })).to.equal(
                true,
            );
        });

        it("engages harmless hostiles regardless of strength", () => {
            expect(SquadCoordinator.shouldEngage({ ...baseInput, ourPower: 0, hostilePower: 0 })).to.equal(true);
        });
    });

    describe("findPatient", () => {
        const squadWith = (members: any[]): Squad =>
            ({
                members,
                fighters: members.filter(m => m.memory.role !== CreepRole.HEALER),
                healers: members.filter(m => m.memory.role === CreepRole.HEALER),
            }) as Squad;

        it("returns null when nobody is hurt", () => {
            const healer = makeMember(CreepRole.HEALER, 100, 100, 10, "healer");
            const squad = squadWith([healer, makeMember(CreepRole.DEFENDER, 100, 100, 11, "d1")]);
            expect(SquadCoordinator.findPatient(squad, healer)).to.equal(null);
        });

        it("picks the most badly wounded squad member", () => {
            const healer = makeMember(CreepRole.HEALER, 100, 100, 10, "healer");
            const scratched = makeMember(CreepRole.DEFENDER, 90, 100, 11, "d1");
            const dying = makeMember(CreepRole.DEFENDER, 20, 100, 12, "d2");
            const squad = squadWith([healer, scratched, dying]);
            expect(SquadCoordinator.findPatient(squad, healer)).to.equal(dying);
        });

        it("prefers a fighter over an equally hurt healer, since the line protects everyone", () => {
            const healer = makeMember(CreepRole.HEALER, 100, 100, 10, "healer");
            const hurtHealer = makeMember(CreepRole.HEALER, 50, 100, 11, "h2");
            const hurtFighter = makeMember(CreepRole.DEFENDER, 50, 100, 11, "d1");
            const squad = squadWith([healer, hurtHealer, hurtFighter]);
            expect(SquadCoordinator.findPatient(squad, healer)).to.equal(hurtFighter);
        });

        it("never returns the healer itself", () => {
            const healer = makeMember(CreepRole.HEALER, 10, 100, 10, "healer");
            const squad = squadWith([healer]);
            expect(SquadCoordinator.findPatient(squad, healer)).to.equal(null);
        });
    });
});
