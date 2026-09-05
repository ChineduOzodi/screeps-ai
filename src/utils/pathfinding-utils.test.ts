import { expect } from "chai";
import { PathfindingUtils } from "./pathfinding-utils";

describe("PathfindingUtils reservations", () => {
    beforeEach(() => {
        // @ts-ignore
        global.Memory = { rooms: {} };
        // @ts-ignore
        global.Game = { time: 1000, creeps: {} };
    });

    function fakeCreep(name: string, roomName: string): Creep {
        return {
            name,
            room: { name: roomName },
            memory: { role: "scout", movementSystem: {} },
        } as unknown as Creep;
    }

    it("reserves a position in a room that has no memory yet", () => {
        const creep = fakeCreep("scout1", "W1N1");
        const target = new RoomPosition(25, 25, "W2N1");

        expect(() => PathfindingUtils.reserveLocation(creep, target, 1010, 1020)).to.not.throw();

        const entry = Memory.rooms.W2N1.positionReservations["25,25"];
        expect(entry.reservations).to.have.length(1);
        expect(entry.reservations[0].creepName).to.equal("scout1");
        expect(creep.memory.movementSystem?.reservedRoomName).to.equal("W2N1");
    });

    it("keeps existing room memory when adding a reservation", () => {
        // @ts-ignore
        Memory.rooms.W1N1 = { repairStats: { lastCheck: 5 } };
        const creep = fakeCreep("scout1", "W1N1");

        PathfindingUtils.reserveLocation(creep, new RoomPosition(3, 4, "W1N1"), 1001, 1002);

        expect((Memory.rooms.W1N1 as any).repairStats.lastCheck).to.equal(5);
        expect(Memory.rooms.W1N1.positionReservations["3,4"].reservations).to.have.length(1);
    });

    it("checkReservationAvailable tolerates a room with no memory", () => {
        const free = PathfindingUtils.checkReservationAvailable("W9N9", new RoomPosition(1, 1, "W9N9"), 1000, 1001);
        expect(free).to.equal(true);
    });
});
