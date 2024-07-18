/* eslint-disable max-classes-per-file */
import { CreepProfiles, CreepRole, CreepRunner } from "prototypes/creep";

import { ColonyManager } from "prototypes/colony";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { MovementSystem } from "systems/movement-system";

export class UpgraderCreep extends CreepRunner {
    public override onRun(): void {
        this.runUpgraderCreep();
    }

    private runUpgraderCreep(): void {
        const creep = this.creep;
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
            delete creep.memory.targetId;
            delete creep.memory.movementSystem?.path;
            creep.say("u: harvesting");
        }
        if (!creep.memory.working && creep.store[RESOURCE_ENERGY] === creep.store.getCapacity()) {
            creep.memory.working = true;
            delete creep.memory.targetId;
            delete creep.memory.movementSystem?.path;
            creep.say("upgrading");
        }
        if (creep.memory.working) {
            if (!creep.room.controller) {
                throw new Error(`${creep.id} - No room controller to upgrade: ${creep.room.name}`);
            }

            if (this.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                MovementSystem.moveToWithReservation(creep, creep.room.controller, creep.memory.workDuration, 3);
            }
        } else {
            // Find energy
            this.getEnergy();
        }
    }
}

export class UpgraderCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(energyCap: number, colony: ColonyManager): CreepProfiles {
        const energyUsagePerCreep = -colony.getTotalEstimatedEnergyFlowRate(CreepRole.UPGRADER);
        let desiredAmount = 1;
        if (energyUsagePerCreep > 0) {
            desiredAmount = Math.min(4, Math.max(1, Math.floor(energyCap / energyUsagePerCreep)));
        }

        const body: BodyPartConstant[] = [];

        body.push(WORK);
        body.push(CARRY);
        body.push(CARRY);
        body.push(MOVE);
        body.push(MOVE);

        const energyUsePerTick = UPGRADE_CONTROLLER_POWER * 1;

        const memory: AddCreepToQueueOptions = {
            workTargetId: colony.getMainRoom().controller?.id,
            workDuration: (CARRY_CAPACITY * 2) / energyUsePerTick,
            averageEnergyConsumptionProductionPerTick: energyUsePerTick,
            role: CreepRole.UPGRADER,
        };

        const creepSpawnManagement: CreepSpawnerProfileInfo = {
            creepNames: [],
            desiredAmount: 1,
            bodyBlueprint: body,
            memoryBlueprint: memory,
        };

        const profiles: CreepProfiles = {};
        profiles[CreepRole.UPGRADER] = creepSpawnManagement;
        return profiles;
    }
}
