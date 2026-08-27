import { expect } from "chai";
import { LabManager } from "./lab-manager";

describe("LabManager", () => {
    beforeEach(() => {
        (global as any).REACTIONS = {
            H: { O: "OH" },
            O: { H: "OH" },
            U: { H: "UH", O: "UO" },
            L: { O: "LO" },
            K: { O: "KO" },
        };
        (global as any).ATTACK = "attack";
        (global as any).RANGED_ATTACK = "ranged_attack";
        (global as any).HEAL = "heal";
        (global as any).TOUGH = "tough";
        (global as any).MOVE = "move";
        (global as any).FIND_MY_STRUCTURES = "myStructures";
        (global as any).STRUCTURE_LAB = "lab";
        (global as any).RESOURCE_ENERGY = "energy";
        (global as any).LAB_BOOST_MINERAL = 30;
        (global as any).LAB_BOOST_ENERGY = 20;
    });

    describe("reagentsForProduct", () => {
        it("should find the reagent pair for a product", () => {
            expect(LabManager.reagentsForProduct("UH" as ResourceConstant)).to.deep.equal(["U", "H"]);
            expect(LabManager.reagentsForProduct("LO" as ResourceConstant)).to.deep.equal(["L", "O"]);
        });

        it("should return null for unknown products", () => {
            expect(LabManager.reagentsForProduct("XYZ" as ResourceConstant)).to.equal(null);
        });
    });

    describe("findBoostLab", () => {
        const makeLab = (mineralType: string | undefined, mineralAmount: number, energy: number): any => ({
            structureType: "lab",
            mineralType,
            store: {
                [mineralType || ""]: mineralAmount,
                energy,
            },
        });

        it("should find a lab holding a matching boost with enough compound and energy", () => {
            const uhLab = makeLab("UH", 300, 600);
            const room: any = {
                find: () => [makeLab(undefined, 0, 0), uhLab],
            };
            // 10 attack parts need 300 mineral and 200 energy
            expect(LabManager.findBoostLab(room, ATTACK, 10)).to.equal(uhLab);
        });

        it("should return null when the lab lacks enough compound", () => {
            const room: any = {
                find: () => [makeLab("UH", 100, 600)],
            };
            expect(LabManager.findBoostLab(room, ATTACK, 10)).to.equal(null);
        });

        it("should prefer higher-tier boosts when available", () => {
            const uhLab = makeLab("UH", 900, 900);
            const xLab = makeLab("XUH2O", 900, 900);
            const room: any = {
                find: () => [uhLab, xLab],
            };
            expect(LabManager.findBoostLab(room, ATTACK, 10)).to.equal(xLab);
        });

        it("should return null for parts with no boost mapping", () => {
            const room: any = {
                find: () => [makeLab("UH", 900, 900)],
            };
            expect(LabManager.findBoostLab(room, "carry" as BodyPartConstant, 5)).to.equal(null);
        });
    });
});
