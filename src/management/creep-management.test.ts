import "../prototypes/room.extensions";
import "../prototypes/memory.extensions";
import "../prototypes/colony.extensions";
import "../prototypes/creep.extensions";
import { expect } from "chai";
import * as sinon from "sinon";
import { CreepManagement } from "./creep-management";
import { CreepRole } from "prototypes/types";
import { BuilderCreep } from "creep-roles/builder-creep";
import { DefenderCreep } from "creep-roles/defender-creep";
import { HealerCreep } from "creep-roles/healer-creep";
import { HarvesterCreep } from "creep-roles/harvester-creep";
import { MinerCreep } from "creep-roles/miner-creep";
import { CarrierCreep } from "creep-roles/carrier-creep";
import { ExtensionFillerCreep } from "creep-roles/extension-filler-creep";
import { RepairerCreep } from "./../creep-roles/repairer-creep";
import { UpgraderCreep } from "creep-roles/upgrader-creep";
import { ScoutCreep } from "creep-roles/scout-creep";
import { ReserverCreep } from "creep-roles/reserver-creep";
import { Movement } from "infrastructure/movement";
import { Logger } from "utils/logger";
import { ColonyManagerImpl } from "prototypes/colony";

describe("CreepManagement", () => {
    let mockCreep: any;
    let loggerErrorStub: sinon.SinonStub;
    let movementRunStub: sinon.SinonStub;

    beforeEach(() => {
        mockCreep = {
            name: "testCreep",
            id: "id_123",
            spawning: false,
            room: { name: "W1N1" },
            memory: { role: undefined, colonyId: undefined }
        };
        (global as any).Memory = { colonies: {} };
        loggerErrorStub = sinon.stub(Logger, "error");
        movementRunStub = sinon.stub(Movement, "run");
    });

    afterEach(() => {
        loggerErrorStub.restore();
        movementRunStub.restore();
    });

    describe("getCreepRunner", () => {
        const rolesToTest = [
            { role: CreepRole.HARVESTER, expectedClass: HarvesterCreep },
            { role: CreepRole.REPAIRER, expectedClass: RepairerCreep },
            { role: CreepRole.UPGRADER, expectedClass: UpgraderCreep },
            { role: CreepRole.BUILDER, expectedClass: BuilderCreep },
            { role: CreepRole.DEFENDER, expectedClass: DefenderCreep },
            { role: CreepRole.HEALER, expectedClass: HealerCreep },
            { role: CreepRole.MINER, expectedClass: MinerCreep },
            { role: CreepRole.CARRIER, expectedClass: CarrierCreep },
            { role: CreepRole.EXTENSION_FILLER, expectedClass: ExtensionFillerCreep },
            { role: CreepRole.SCOUT, expectedClass: ScoutCreep },
            { role: CreepRole.RESERVER, expectedClass: ReserverCreep },
        ];

        rolesToTest.forEach(({ role, expectedClass }) => {
            it(`should return a ${expectedClass.name} when role is ${role}`, () => {
                mockCreep.memory.role = role;
                const runner = CreepManagement.getCreepRunner(mockCreep as Creep);
                expect(runner).to.be.instanceOf(expectedClass);
            });
        });

        it("should return undefined and log error when role is not set up", () => {
            mockCreep.memory.role = "UNKNOWN_ROLE";
            const runner = CreepManagement.getCreepRunner(mockCreep as Creep);
            expect(runner).to.be.undefined;
            sinon.assert.calledWith(loggerErrorStub, `creep (testCreep) role "UNKNOWN_ROLE" not setup`);
        });
    });

    describe("run", () => {
        let getCreepRunnerStub: sinon.SinonStub;

        beforeEach(() => {
            getCreepRunnerStub = sinon.stub(CreepManagement, "getCreepRunner");
        });

        afterEach(() => {
            getCreepRunnerStub.restore();
        });

        it("should return early if creep is spawning", () => {
            mockCreep.spawning = true;
            CreepManagement.run(mockCreep as Creep);
            sinon.assert.notCalled(getCreepRunnerStub);
            sinon.assert.notCalled(movementRunStub);
        });

        it("should return early if getCreepRunner returns undefined", () => {
            getCreepRunnerStub.returns(undefined);
            CreepManagement.run(mockCreep as Creep);
            sinon.assert.calledOnce(getCreepRunnerStub);
            sinon.assert.notCalled(movementRunStub);
        });

        it("should run creep runner and movement, and setup colony when valid", () => {
            const runnerMock = {
                setColony: sinon.stub(),
                run: sinon.stub()
            };
            getCreepRunnerStub.returns(runnerMock);

            const colonyData = { creeps: { testCreep: { id: undefined } } };
            (global as any).Memory.colonies["W1N1"] = colonyData;

            CreepManagement.run(mockCreep as Creep);

            expect(mockCreep.memory.colonyId).to.equal("W1N1");
            sinon.assert.calledOnce(runnerMock.setColony);
            expect(runnerMock.setColony.firstCall.args[0]).to.be.instanceOf(ColonyManagerImpl);
            expect(colonyData.creeps.testCreep.id).to.equal("id_123");

            sinon.assert.calledOnce(runnerMock.run);
            sinon.assert.calledWith(movementRunStub, mockCreep);
        });

        it("should not set colony id in memory if colony does not exist in Memory.colonies and no initial room match", () => {
            const runnerMock = {
                setColony: sinon.stub(),
                run: sinon.stub()
            };
            getCreepRunnerStub.returns(runnerMock);

            // Creep's colonyId not in Memory.colonies, it will fallback to room name
            mockCreep.memory.colonyId = "nonexistent";
            mockCreep.room.name = "FallbackRoom";

            CreepManagement.run(mockCreep as Creep);

            expect(mockCreep.memory.colonyId).to.equal("FallbackRoom");
            sinon.assert.notCalled(runnerMock.setColony);
            sinon.assert.calledOnce(runnerMock.run);
            sinon.assert.calledWith(movementRunStub, mockCreep);
        });
    });
});
