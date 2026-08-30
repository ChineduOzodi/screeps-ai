import "prototypes/colony.extensions";
import "prototypes/creep.extensions";
import "prototypes/memory.extensions";
import { SafeModeGuard, SafeModeInput } from "./safe-mode";
import { expect } from "chai";

const attack = (overrides: Partial<SafeModeInput> = {}): SafeModeInput => ({
    hostileAttackPower: 600,
    hostileCount: 3,
    hostilesInCore: 0,
    criticalStructureDamaged: false,
    hasSpawn: true,
    defensePower: 900,
    controllerThreatened: false,
    myCreepsUnderAttack: 0,
    npcOnly: false,
    ...overrides,
});

describe("SafeModeGuard", () => {
    describe("shouldActivate", () => {
        it("does nothing when the room is quiet", () => {
            expect(SafeModeGuard.shouldActivate(attack({ hostileCount: 0 }))).to.equal(false);
        });

        it("ignores harmless hostiles such as scouts", () => {
            expect(SafeModeGuard.shouldActivate(attack({ hostileAttackPower: 0, hostilesInCore: 2 }))).to.equal(false);
        });

        it("holds while our towers and defenders out-damage the attackers", () => {
            expect(SafeModeGuard.shouldActivate(attack({ hostilesInCore: 3, defensePower: 900 }))).to.equal(false);
        });

        it("activates when attackers are in the base and we cannot out-damage them", () => {
            expect(SafeModeGuard.shouldActivate(attack({ hostilesInCore: 2, defensePower: 200 }))).to.equal(true);
        });

        it("activates once critical structures are being destroyed and we are losing", () => {
            expect(
                SafeModeGuard.shouldActivate(attack({ criticalStructureDamaged: true, defensePower: 100 })),
            ).to.equal(true);
        });

        it("activates when the last spawn is gone", () => {
            expect(SafeModeGuard.shouldActivate(attack({ hasSpawn: false, defensePower: 5000 }))).to.equal(true);
        });

        it("activates when a claimer is on our controller, even without attack power", () => {
            expect(
                SafeModeGuard.shouldActivate(
                    attack({ hostileAttackPower: 0, controllerThreatened: true, defensePower: 5000 }),
                ),
            ).to.equal(true);
        });

        it("absorbs a small raid that costs us a single creep, rather than spending a charge", () => {
            expect(
                SafeModeGuard.shouldActivate(attack({ defensePower: 0, hostilesInCore: 0, myCreepsUnderAttack: 1 })),
            ).to.equal(false);
        });

        it("activates when raiders are cutting down our creeps and we cannot out-damage them", () => {
            // What actually happened: no tower, no structures touched, they just farmed our creeps.
            expect(
                SafeModeGuard.shouldActivate(attack({ defensePower: 0, hostilesInCore: 0, myCreepsUnderAttack: 2 })),
            ).to.equal(true);
        });

        it("gives NPC raiders more rope, since they leave on their own", () => {
            const npcRaid = attack({ defensePower: 0, hostilesInCore: 0, npcOnly: true });
            expect(SafeModeGuard.shouldActivate({ ...npcRaid, myCreepsUnderAttack: 2 })).to.equal(false);
            expect(SafeModeGuard.shouldActivate({ ...npcRaid, myCreepsUnderAttack: 3 })).to.equal(true);
        });

        it("tolerates a single creep being chipped while we still have towers and fighters", () => {
            expect(
                SafeModeGuard.shouldActivate(attack({ defensePower: 400, hostilesInCore: 0, myCreepsUnderAttack: 1 })),
            ).to.equal(false);
        });

        it("does not fire while our defense out-damages the raiders", () => {
            expect(
                SafeModeGuard.shouldActivate(attack({ defensePower: 1200, hostilesInCore: 0, myCreepsUnderAttack: 3 })),
            ).to.equal(false);
        });

        it("does not fire on a fight happening outside the base that we are winning", () => {
            expect(SafeModeGuard.shouldActivate(attack({ hostilesInCore: 0, defensePower: 1200 }))).to.equal(false);
        });
    });
});
