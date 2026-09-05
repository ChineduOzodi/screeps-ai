import { expect } from "chai";
import { isRemoteMiningCandidate, rankRemoteRooms, selectRemoteRooms } from "./remote-rooms";

const ME = "chin24";

function room(name: string, overrides: Partial<RoomData> = {}): RoomData {
    return { name, alertLevel: 0, sourceCount: 2, distance: 50, ...overrides };
}

describe("remote-rooms", () => {
    it("skips rooms with no sources so they do not waste a remote slot", () => {
        // The live case: a sourceless room 3 tiles closer held a slot while a two-source room sat idle.
        const rooms = {
            E29N12: room("E29N12", { isMain: true }),
            E30N12: room("E30N12", { sourceCount: 0, distance: 53 }),
            E28N12: room("E28N12", { sourceCount: 1, distance: 50 }),
            E28N11: room("E28N11", { sourceCount: 2, distance: 83 }),
        };
        expect(selectRemoteRooms(rooms, 4, ME)).to.deep.equal(["E28N12", "E28N11"]);
    });

    it("caps the selection at floor(RCL / 2) closest rooms", () => {
        const rooms = {
            A: room("A", { distance: 30 }),
            B: room("B", { distance: 20 }),
            C: room("C", { distance: 40 }),
        };
        expect(selectRemoteRooms(rooms, 2, ME)).to.deep.equal(["B"]);
        expect(selectRemoteRooms(rooms, 5, ME)).to.deep.equal(["B", "A"]);
        expect(selectRemoteRooms(rooms, 1, ME)).to.deep.equal([]);
        expect(rankRemoteRooms(rooms, ME)).to.deep.equal(["B", "A", "C"]);
    });

    it("rejects rooms that are owned, reserved by someone else, threatened, or unscouted", () => {
        expect(isRemoteMiningCandidate(room("A", { owner: "Rival" }), ME)).to.equal(false);
        expect(isRemoteMiningCandidate(room("A", { reservation: "Rival" }), ME)).to.equal(false);
        expect(isRemoteMiningCandidate(room("A", { reservation: ME }), ME)).to.equal(true);
        expect(isRemoteMiningCandidate(room("A", { alertLevel: 2 }), ME)).to.equal(false);
        expect(isRemoteMiningCandidate(room("A", { alertLevel: 1 }), ME)).to.equal(true);
        expect(isRemoteMiningCandidate(room("A", { distance: undefined }), ME)).to.equal(false);
        expect(isRemoteMiningCandidate(room("A", { isMain: true }), ME)).to.equal(false);
    });
});
