import { assert } from "chai";
import { stub } from "sinon";
import { CarrierCreep } from "./carrier-creep";
import { CreepRole } from "prototypes/types";
import { Game, Memory } from "../../test/utils/mock";

// Ensure RoomPosition is available for tests
// @ts-ignore
if (!global.RoomPosition) {
    // @ts-ignore
    global.RoomPosition = class {
        public x: number;
        public y: number;
        public roomName: string;
        public constructor(x: number, y: number, roomName: string) {
            this.x = x;
            this.y = y;
            this.roomName = roomName;
        }
        public isEqualTo() {
            return false;
        }
        public isNearTo() {
            return false;
        }
        public inRangeTo() {
            return false;
        }
    } as any;
}

describe("CarrierCreep", () => {
    let creep: Creep;
    let carrier: CarrierCreep;

    beforeEach(() => {
        // @ts-expect-error : allow adding Game to global
        global.Game = _.cloneDeep(Game);
        // @ts-expect-error : allow adding Memory to global
        global.Memory = _.cloneDeep(Memory);

        // Setup mock creep
        creep = {
            id: "creep-id" as Id<Creep>,
            name: "carrier-1",
            room: {
                name: "W1N1",
                find: stub().returns([]),
                controller: {
                    id: "controller-id" as Id<StructureController>,
                    pos: new RoomPosition(10, 10, "W1N1"),
                    structureType: STRUCTURE_CONTROLLER,
                    my: true,
                },
            },
            memory: {
                role: CreepRole.CARRIER,
                working: true,
                colonyId: "W1N1",
            },
            store: {
                getUsedCapacity: stub().returns(50),
                getCapacity: stub().returns(50),
                getFreeCapacity: stub().returns(0),
                [RESOURCE_ENERGY]: 50,
            },
            say: stub(),
            pos: {
                x: 20,
                y: 20,
                roomName: "W1N1",
                findClosestByPath: stub().returns(null),
                inRangeTo: stub().returns(false),
            },
        } as any;

        carrier = new CarrierCreep(creep);

        // Mock getColony on the instance to return a mocked ColonyManager-like object
        stub(carrier, "getColony").returns({
            id: "W1N1",
            getPrimaryStorage: stub().returns(undefined),
        } as any);

        // Stub methods inherited from CreepRunner to verify they are called correctly
        stub(carrier as any, "moveToWithReservation").returns(OK);
        stub(carrier as any, "transfer").returns(OK);
        stub(carrier as any, "upgradeController").returns(OK);
    });

    describe("deliverEnergy", () => {
        it("should target Spawns/Extensions in the local room if they have free capacity", () => {
            const spawn = {
                id: "spawn-1",
                structureType: STRUCTURE_SPAWN,
                store: { getFreeCapacity: (res: ResourceConstant) => (res === RESOURCE_ENERGY ? 100 : 0) },
            };
            const extension = {
                id: "extension-1",
                structureType: STRUCTURE_EXTENSION,
                store: { getFreeCapacity: (res: ResourceConstant) => (res === RESOURCE_ENERGY ? 50 : 0) },
            };

            // Carrier likely searches for structures in the room
            (creep.pos.findClosestByPath as sinon.SinonStub).returns(spawn);

            // Call deliverEnergy private method
            (carrier as any).deliverEnergy();

            const transferStub = (carrier as any).transfer as sinon.SinonStub;
            assert.isTrue(transferStub.called, "Should call transfer to a delivery target");
            const target = transferStub.firstCall.args[0];
            assert.include(
                [STRUCTURE_SPAWN, STRUCTURE_EXTENSION],
                target.structureType,
                "Target should be a spawn or extension",
            );
        });

        it("should fallback to Colony's Primary Storage when local Spawns/Extensions are full", () => {
            // No spawns/extensions with capacity
            (creep.room.find as sinon.SinonStub).returns([]);

            const storage = {
                id: "storage-1",
                structureType: STRUCTURE_STORAGE,
                store: { getFreeCapacity: (res: ResourceConstant) => (res === RESOURCE_ENERGY ? 1000 : 0) },
                isActive: () => true,
            };

            const colony = carrier.getColony() as any;
            colony.getPrimaryStorage.returns(storage);

            (carrier as any).deliverEnergy();

            const transferStub = (carrier as any).transfer as sinon.SinonStub;
            assert.isTrue(
                transferStub.calledWith(storage, RESOURCE_ENERGY),
                "Should target primary storage as fallback",
            );
        });

        it("should check getFreeCapacity(RESOURCE_ENERGY) > 0 on Primary Storage before targeting it", () => {
            // Spawns/Extensions are full
            (creep.pos.findClosestByPath as sinon.SinonStub).onCall(0).returns(null);

            const fullStorage = {
                id: "storage-full",
                structureType: STRUCTURE_STORAGE,
                store: { getFreeCapacity: (res: ResourceConstant) => (res === RESOURCE_ENERGY ? 0 : 0) },
                isActive: () => true,
            };

            const tower = {
                id: "tower-1",
                structureType: STRUCTURE_TOWER,
                store: { getFreeCapacity: (res: ResourceConstant) => (res === RESOURCE_ENERGY ? 100 : 0) },
            };

            const colony = carrier.getColony() as any;
            colony.getPrimaryStorage.returns(fullStorage);

            // Towers are found in the room next
            (creep.pos.findClosestByPath as sinon.SinonStub).onCall(1).returns(tower);

            (carrier as any).deliverEnergy();

            const transferStub = (carrier as any).transfer as sinon.SinonStub;
            assert.isFalse(
                transferStub.calledWith(fullStorage, RESOURCE_ENERGY),
                "Should NOT target primary storage if it is full",
            );
            assert.isTrue(transferStub.calledWith(tower, RESOURCE_ENERGY), "Should target tower when storage is full");
        });

        it("should fallback to Towers if Storage is full or missing", () => {
            // No spawns/extensions
            (creep.pos.findClosestByPath as sinon.SinonStub).onCall(0).returns(null);

            const colony = carrier.getColony() as any;
            colony.getPrimaryStorage.returns(undefined);

            const tower = {
                id: "tower-1",
                structureType: STRUCTURE_TOWER,
                store: { getFreeCapacity: (res: ResourceConstant) => (res === RESOURCE_ENERGY ? 100 : 0) },
            };
            (creep.pos.findClosestByPath as sinon.SinonStub).onCall(1).returns(tower);

            (carrier as any).deliverEnergy();

            const transferStub = (carrier as any).transfer as sinon.SinonStub;
            assert.isTrue(
                transferStub.calledWith(tower, RESOURCE_ENERGY),
                "Should target tower when storage is missing",
            );
        });

        it("should fallback to the Controller as a last resort", () => {
            // Nothing else available or has capacity
            (creep.room.find as sinon.SinonStub).returns([]);
            const colony = carrier.getColony() as any;
            colony.getPrimaryStorage.returns(undefined);

            (carrier as any).deliverEnergy();

            const upgradeStub = (carrier as any).upgradeController as sinon.SinonStub;
            assert.isTrue(
                upgradeStub.calledWith(creep.room.controller),
                "Should fallback to the controller as a last resort",
            );
        });
    });
});
