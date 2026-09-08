import { expect } from "chai";
import "prototypes/memory.extensions";
import {
    assignRemoteRooms,
    isRemoteMiningCandidate,
    rankRemoteRooms,
    remoteClaimantsFromMemory,
    remoteRoomOwner,
    selectRemoteRooms,
} from "./remote-rooms";

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
        expect(selectRemoteRooms("E29N12", { E29N12: { rooms, rcl: 4 } }, ME)).to.deep.equal(["E28N12", "E28N11"]);
    });

    it("caps the selection at floor(RCL / 2) closest rooms", () => {
        const rooms = {
            A: room("A", { distance: 30 }),
            B: room("B", { distance: 20 }),
            C: room("C", { distance: 40 }),
        };
        const at = (rcl: number) => selectRemoteRooms("M", { M: { rooms, rcl } }, ME);
        expect(at(2)).to.deep.equal(["B"]);
        expect(at(5)).to.deep.equal(["B", "A"]);
        expect(at(1)).to.deep.equal([]);
        expect(selectRemoteRooms("unknown", { M: { rooms, rcl: 5 } }, ME)).to.deep.equal([]);
        expect(rankRemoteRooms(rooms, ME)).to.deep.equal(["B", "A", "C"]);
    });

    it("gives a room shared by several colonies to the closest one only", () => {
        // The live case: three colonies all mined the single source in E28N12.
        const colonies = {
            E29N12: {
                rcl: 4,
                rooms: { E28N12: room("E28N12", { distance: 50 }), E28N11: room("E28N11", { distance: 83 }) },
            },
            E29N11: {
                rcl: 4,
                rooms: { E28N12: room("E28N12", { distance: 89 }), E28N10: room("E28N10", { distance: 58 }) },
            },
            E28N11: {
                rcl: 4,
                rooms: { E28N12: room("E28N12", { distance: 54 }), E27N12: room("E27N12", { distance: 22 }) },
            },
        };
        const assignment = assignRemoteRooms(colonies, ME);
        expect(assignment).to.deep.equal({
            E29N12: ["E28N12", "E28N11"],
            E29N11: ["E28N10"],
            E28N11: ["E27N12"],
        });
        expect(remoteRoomOwner("E28N12", assignment)).to.equal("E29N12");
        expect(remoteRoomOwner("nowhere", assignment)).to.equal(undefined);
        expect(selectRemoteRooms("E29N11", colonies, ME)).to.deep.equal(["E28N10"]);
    });

    it("passes a room to the next closest colony when the closest is out of slots", () => {
        const colonies = {
            A: { rcl: 2, rooms: { X: room("X", { distance: 10 }), Y: room("Y", { distance: 20 }) } },
            B: { rcl: 2, rooms: { Y: room("Y", { distance: 30 }) } },
        };
        expect(assignRemoteRooms(colonies, ME)).to.deep.equal({ A: ["X"], B: ["Y"] });
    });

    it("breaks distance ties by colony id so the result is stable", () => {
        const colonies = {
            B: { rcl: 2, rooms: { X: room("X", { distance: 10 }) } },
            A: { rcl: 2, rooms: { X: room("X", { distance: 10 }) } },
        };
        expect(assignRemoteRooms(colonies, ME)).to.deep.equal({ A: ["X"], B: [] });
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

    describe("remoteClaimantsFromMemory", () => {
        beforeEach(() => {
            // @ts-ignore
            global.Memory = { colonies: {} };
        });

        it("reads every colony's rooms and level, skipping unmigrated array room lists", () => {
            Memory.colonies = {
                A: { id: "A", level: 4, rooms: { X: room("X") } } as any,
                B: { id: "B", level: 3, rooms: [room("Y")] } as any,
                C: undefined,
            };
            const claimants = remoteClaimantsFromMemory();
            expect(Object.keys(claimants)).to.deep.equal(["A"]);
            expect(claimants.A.rcl).to.equal(4);
            expect(Object.keys(claimants.A.rooms)).to.deep.equal(["X"]);
        });

        it("lets the caller substitute live values and add a colony Memory has not stored yet", () => {
            Memory.colonies = { A: { id: "A", level: 2, rooms: { X: room("X") } } as any };
            const claimants = remoteClaimantsFromMemory({ A: { rcl: 3 }, B: { rooms: { Y: room("Y") }, rcl: 4 } });
            expect(claimants.A.rcl).to.equal(3);
            expect(Object.keys(claimants.A.rooms)).to.deep.equal(["X"]);
            expect(claimants.B.rcl).to.equal(4);
            expect(Object.keys(claimants.B.rooms)).to.deep.equal(["Y"]);
        });
    });
});
