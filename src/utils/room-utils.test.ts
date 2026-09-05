import { expect } from "chai";
import { RoomUtils } from "./room-utils";

describe("RoomUtils", () => {
    beforeEach(() => {
        // Reset globals
        (global as any).Game = {
            map: {
                describeExits: () => ({}),
            },
            rooms: {},
            time: 1000,
        };
    });

    describe("getRoomsNeedingScout", () => {
        it("should return adjacent rooms if they have no data in colony memory", () => {
            const mockColony = {
                getMainRoom: () => ({ name: "W1N1" }),
                colonyInfo: {
                    rooms: {
                        W1N1: { name: "W1N1", isMain: true, lastScouted: 1000 },
                    },
                },
            } as any;

            (global as any).Game.map.describeExits = () => ({ "1": "W1N2", "3": "W2N1" });

            const needing = RoomUtils.getRoomsNeedingScout(mockColony);
            expect(needing).to.include.members(["W1N2", "W2N1"]);
        });

        it("should return rooms that haven't been scouted in over 1000 ticks", () => {
            const mockColony = {
                getMainRoom: () => ({ name: "W1N1" }),
                colonyInfo: {
                    rooms: {
                        W1N2: { name: "W1N2", lastScouted: 100 },
                    },
                },
            } as any;

            (global as any).Game.time = 1200;
            (global as any).Game.map.describeExits = () => ({ "1": "W1N2" });

            const needing = RoomUtils.getRoomsNeedingScout(mockColony);
            expect(needing).to.include("W1N2");
        });

        it("should not return rooms that were scouted recently", () => {
            const mockColony = {
                getMainRoom: () => ({ name: "W1N1" }),
                colonyInfo: {
                    rooms: {
                        W1N2: { name: "W1N2", lastScouted: 1150 },
                    },
                },
            } as any;

            (global as any).Game.time = 1200;
            (global as any).Game.map.describeExits = () => ({ "1": "W1N2" });
            (global as any).Game.rooms.W1N2 = {}; // Simulating vision

            const needing = RoomUtils.getRoomsNeedingScout(mockColony);
            expect(needing).to.not.include("W1N2");
        });
    });

    describe("scouting depth and reachability", () => {
        function exitsFrom(map: { [room: string]: string[] }) {
            (global as any).Game.map.describeExits = (name: string) => {
                const result: Record<string, string> = {};
                (map[name] || []).forEach((exit, i) => (result[String(i)] = exit));
                return result;
            };
        }

        it("scouts two exit hops out so neighbours of neighbours are known", () => {
            exitsFrom({ W1N1: ["W1N2"], W1N2: ["W1N1", "W1N3"], W1N3: ["W1N2", "W1N4"] });
            const mockColony = {
                getMainRoom: () => ({ name: "W1N1" }),
                colonyInfo: { rooms: { W1N1: { name: "W1N1", isMain: true } } },
            } as any;

            const needing = RoomUtils.getRoomsNeedingScout(mockColony);
            expect(needing).to.have.members(["W1N2", "W1N3"]);
        });

        it("leaves out rooms behind zone walls and closed rooms", () => {
            exitsFrom({ W1N1: ["W1N2", "W2N1", "W0N1"] });
            const statuses: { [name: string]: string } = {
                W1N1: "respawn",
                W1N2: "respawn",
                W2N1: "normal",
                W0N1: "closed",
            };
            (global as any).Game.map.getRoomStatus = (name: string) => ({ status: statuses[name] });
            const mockColony = {
                getMainRoom: () => ({ name: "W1N1" }),
                colonyInfo: { rooms: {} },
            } as any;

            expect(RoomUtils.getRoomsNeedingScout(mockColony)).to.deep.equal(["W1N2"]);
            expect(RoomUtils.isRoomReachable("W1N1", "W2N1")).to.equal(false);
            expect(RoomUtils.isRoomReachable("W1N1", "W1N2")).to.equal(true);
        });

        it("treats every room as reachable on servers without room status", () => {
            expect(RoomUtils.getRoomStatus("W1N1")).to.equal("normal");
            expect(RoomUtils.isRoomReachable("W1N1", "W9N9")).to.equal(true);
        });

        it("waits longer before re-scouting a defended enemy room and honours failed attempts", () => {
            exitsFrom({ W1N1: ["ENEMY", "STUCK"] });
            const mockColony = {
                getMainRoom: () => ({ name: "W1N1" }),
                colonyInfo: {
                    rooms: {
                        ENEMY: { name: "ENEMY", owner: "Rival", towerCount: 2, lastScouted: 100 },
                        STUCK: { name: "STUCK", lastScoutAttempt: 1000 },
                    },
                },
            } as any;

            (global as any).Game.time = 1200;
            expect(RoomUtils.getRoomsNeedingScout(mockColony)).to.deep.equal([]);
            (global as any).Game.time = 2500;
            expect(RoomUtils.getRoomsNeedingScout(mockColony)).to.deep.equal(["STUCK"]);
            (global as any).Game.time = 5200;
            expect(RoomUtils.getRoomsNeedingScout(mockColony)).to.have.members(["ENEMY", "STUCK"]);
        });
    });

    describe("owner intel", () => {
        function colonyWithRooms() {
            return {
                getMainSpawn: () => undefined,
                colonyInfo: { rooms: {} as { [name: string]: RoomData } },
            } as any;
        }

        function ownedRoom(structures: any[], controller: any) {
            return {
                name: "ENEMY",
                controller,
                find: (type: number) => {
                    if (type === FIND_HOSTILE_STRUCTURES) return structures;
                    return [];
                },
            };
        }

        it("records the owner's controller level, towers, spawns and safe mode", () => {
            const room = ownedRoom(
                [
                    { structureType: STRUCTURE_TOWER },
                    { structureType: STRUCTURE_TOWER },
                    { structureType: STRUCTURE_SPAWN },
                    { structureType: STRUCTURE_EXTENSION },
                ],
                { owner: { username: "Rival" }, level: 5, safeMode: 500, my: false },
            );
            const colony = colonyWithRooms();
            (global as any).Game.time = 1000;

            RoomUtils.updateRoomData(colony, room as any);

            const data = colony.colonyInfo.rooms.ENEMY;
            expect(data.owner).to.equal("Rival");
            expect(data.controllerLevel).to.equal(5);
            expect(data.towerCount).to.equal(2);
            expect(data.spawnCount).to.equal(1);
            expect(data.safeModeUntil).to.equal(1500);
        });

        it("clears the intel once the room is no longer owned by someone else", () => {
            const colony = colonyWithRooms();
            colony.colonyInfo.rooms.ENEMY = {
                name: "ENEMY",
                alertLevel: 0,
                owner: "Rival",
                controllerLevel: 5,
                towerCount: 2,
                spawnCount: 1,
            };
            const abandoned = ownedRoom([], { owner: undefined, level: 0 });

            RoomUtils.updateRoomData(colony, abandoned as any);

            const data = colony.colonyInfo.rooms.ENEMY;
            expect(data.owner).to.equal(undefined);
            expect(data.controllerLevel).to.equal(undefined);
            expect(data.towerCount).to.equal(undefined);
            expect(data.spawnCount).to.equal(undefined);
        });

        it("counts hostile-owned exit neighbours from what any colony remembers", () => {
            (global as any).Game.map.describeExits = () => ({ "1": "ENEMY", "3": "FRIEND", "5": "UNKNOWN" });
            (global as any).Memory = {
                colonies: {
                    A: { rooms: { ENEMY: { name: "ENEMY", alertLevel: 0, owner: "Rival" } } },
                    B: { rooms: { FRIEND: { name: "FRIEND", alertLevel: 0, owner: "me" } } },
                },
            };
            expect(RoomUtils.countHostileNeighbours("X", "me")).to.equal(1);
            expect(RoomUtils.countHostileNeighbours("X", "someone-else")).to.equal(2);
        });
    });

    describe("findBestRoomToScout", () => {
        it("should return the room with the oldest lastScouted time", () => {
            const mockColony = {
                getMainRoom: () => ({ name: "W1N1" }),
                colonyInfo: {
                    rooms: {
                        W1N2: { name: "W1N2", lastScouted: 500 },
                        W2N1: { name: "W2N1", lastScouted: 100 },
                    },
                },
            } as any;

            (global as any).Game.time = 2000;
            (global as any).Game.map.describeExits = () => ({ "1": "W1N2", "3": "W2N1" });

            const best = RoomUtils.findBestRoomToScout(mockColony);
            expect(best).to.equal("W2N1");
        });
    });

    describe("updateRoomData", () => {
        function roomWith(hostileStructures: any[]): any {
            return {
                name: "W2N1",
                controller: undefined,
                find: (type: number, opts?: { filter?: (s: any) => boolean }) => {
                    if (type === FIND_HOSTILE_STRUCTURES) {
                        return opts?.filter ? hostileStructures.filter(opts.filter) : hostileStructures;
                    }
                    return [];
                },
            };
        }
        const colony: any = {
            colonyInfo: { rooms: {} },
            getMainSpawn: () => undefined,
        };

        beforeEach(() => {
            colony.colonyInfo.rooms = {};
        });

        it("should not raise the alert for a power bank or keeper lair", () => {
            RoomUtils.updateRoomData(
                colony,
                roomWith([{ structureType: STRUCTURE_POWER_BANK }, { structureType: STRUCTURE_KEEPER_LAIR }]),
            );
            expect(colony.colonyInfo.rooms.W2N1.alertLevel).to.equal(0);
        });

        it("should raise the alert for an invader core", () => {
            RoomUtils.updateRoomData(colony, roomWith([{ structureType: STRUCTURE_INVADER_CORE }]));
            expect(colony.colonyInfo.rooms.W2N1.alertLevel).to.equal(2);
        });

        function hostileWith(parts: { [part: string]: number }): any {
            return {
                hits: 100,
                getActiveBodyparts: (part: string) => parts[part] || 0,
                pos: { isNearTo: () => false },
            };
        }

        function roomWithCreeps(hostiles: any[]): any {
            return {
                name: "W2N1",
                controller: undefined,
                find: (type: number) => (type === FIND_HOSTILE_CREEPS ? hostiles : []),
            };
        }

        it("does not raise the alert for a bare scout", () => {
            RoomUtils.updateRoomData(colony, roomWithCreeps([hostileWith({ [MOVE]: 1 })]));
            expect(colony.colonyInfo.rooms.W2N1.alertLevel).to.equal(0);
        });

        it("raises a watch alert for unarmed creeps that can reserve, dismantle or haul", () => {
            RoomUtils.updateRoomData(colony, roomWithCreeps([hostileWith({ [CLAIM]: 1, [MOVE]: 1 })]));
            expect(colony.colonyInfo.rooms.W2N1.alertLevel).to.equal(1);
            RoomUtils.updateRoomData(colony, roomWithCreeps([hostileWith({ [WORK]: 2, [MOVE]: 1 })]));
            expect(colony.colonyInfo.rooms.W2N1.alertLevel).to.equal(1);
        });

        it("raises a threat alert for armed creeps", () => {
            RoomUtils.updateRoomData(colony, roomWithCreeps([hostileWith({ [ATTACK]: 2, [MOVE]: 2 })]));
            expect(colony.colonyInfo.rooms.W2N1.alertLevel).to.equal(2);
        });
    });
});
