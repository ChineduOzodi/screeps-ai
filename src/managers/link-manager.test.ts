import { expect } from "chai";
import { LinkManager } from "./link-manager";

describe("LinkManager", () => {
    beforeEach(() => {
        (global as any).FIND_SOURCES = "sources";
        (global as any).FIND_MY_STRUCTURES = "myStructures";
        (global as any).STRUCTURE_LINK = "link";
        (global as any).RESOURCE_ENERGY = "energy";
    });

    const makeLink = (opts: { nearSource?: boolean; nearController?: boolean; energy?: number }): any => ({
        structureType: "link",
        cooldown: 0,
        store: {
            energy: opts.energy || 0,
            getFreeCapacity: () => 800 - (opts.energy || 0),
        },
        pos: {
            inRangeTo: (target: any, _range: number) => {
                if (target.isSource) return opts.nearSource || false;
                if (target.isController) return opts.nearController || false;
                return false;
            },
        },
        transferEnergy: () => 0,
    });

    describe("classifyLinks", () => {
        it("should classify source, controller, and core links", () => {
            const sourcePos = { isSource: true };
            const room: any = {
                controller: { pos: { isController: true } },
                find: (type: string) => (type === "sources" ? [{ pos: sourcePos }] : []),
            };

            const sourceLink = makeLink({ nearSource: true });
            const controllerLink = makeLink({ nearController: true });
            const coreLink = makeLink({});

            const result = LinkManager.classifyLinks(room, [sourceLink, controllerLink, coreLink]);

            expect(result.sourceLinks).to.deep.equal([sourceLink]);
            expect(result.controllerLink).to.equal(controllerLink);
            expect(result.coreLink).to.equal(coreLink);
        });
    });

    describe("run", () => {
        it("should transfer from a full source link to the controller link", () => {
            const sourcePos = { isSource: true };
            const sourceLink = makeLink({ nearSource: true, energy: 800 });
            const controllerLink = makeLink({ nearController: true, energy: 0 });

            let transferredTo: any = null;
            sourceLink.transferEnergy = (target: any) => {
                transferredTo = target;
                return 0;
            };

            const room: any = {
                controller: { pos: { isController: true } },
                find: (type: string) => {
                    if (type === "sources") return [{ pos: sourcePos }];
                    return [sourceLink, controllerLink];
                },
            };

            const colony: any = { getMainRoom: () => room };
            new LinkManager(colony).run();

            expect(transferredTo).to.equal(controllerLink);
        });

        it("should not transfer when the source link is on cooldown", () => {
            const sourcePos = { isSource: true };
            const sourceLink = makeLink({ nearSource: true, energy: 800 });
            sourceLink.cooldown = 5;
            const controllerLink = makeLink({ nearController: true });

            let transferred = false;
            sourceLink.transferEnergy = () => {
                transferred = true;
                return 0;
            };

            const room: any = {
                controller: { pos: { isController: true } },
                find: (type: string) => {
                    if (type === "sources") return [{ pos: sourcePos }];
                    return [sourceLink, controllerLink];
                },
            };

            const colony: any = { getMainRoom: () => room };
            new LinkManager(colony).run();

            expect(transferred).to.equal(false);
        });
    });
});
