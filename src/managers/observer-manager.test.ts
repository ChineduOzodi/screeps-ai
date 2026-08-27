import { expect } from "chai";
import { ObserverManager } from "./observer-manager";

describe("ObserverManager", () => {
    beforeEach(() => {
        (global as any).OBSERVER_RANGE = 10;
        (global as any).Game = {
            time: 5000,
            rooms: {},
            map: {
                describeExits: () => ({ "1": "W1N2", "3": "W2N1" }),
                getRoomLinearDistance: (a: string, b: string) => (b === "W9N9" ? 99 : 1),
            },
        };
    });

    const makeColony = (rooms: any): any => ({
        getMainRoom: () => ({ name: "W1N1" }),
        colonyInfo: { rooms },
    });

    describe("pickObserveTarget", () => {
        it("should pick the stalest room needing a scout", () => {
            const colony = makeColony({
                W1N1: { name: "W1N1", isMain: true, lastScouted: 5000 },
                W1N2: { name: "W1N2", lastScouted: 100 },
                W2N1: { name: "W2N1", lastScouted: 50 },
            });

            expect(ObserverManager.pickObserveTarget(colony, "W1N1")).to.equal("W2N1");
        });

        it("should skip rooms beyond observer range", () => {
            const colony = makeColony({
                W1N1: { name: "W1N1", isMain: true, lastScouted: 5000 },
                W9N9: { name: "W9N9", lastScouted: 10 },
            });
            (global as any).Game.map.describeExits = () => ({});

            // W9N9 is stalest but 99 rooms away — unreachable for the observer
            expect(ObserverManager.pickObserveTarget(colony, "W1N1")).to.equal(undefined);
        });

        it("should return undefined when everything is fresh", () => {
            const colony = makeColony({
                W1N1: { name: "W1N1", isMain: true, lastScouted: 5000 },
                W1N2: { name: "W1N2", lastScouted: 4999 },
                W2N1: { name: "W2N1", lastScouted: 4999 },
            });
            (global as any).Game.rooms = { W1N2: {}, W2N1: {} };

            expect(ObserverManager.pickObserveTarget(colony, "W1N1")).to.equal(undefined);
        });
    });
});
