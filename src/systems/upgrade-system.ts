import { ColonyExtras } from 'prototypes/colony';
import { EnergySystem } from 'systems/energy-system';
import { MovementSystem } from './movement-system';
import { SpawningSystem } from './spawning-system';
export class UpgradeSystem {
    static run(colonyExtras: ColonyExtras) {
        const room = colonyExtras.getMainRoom();

        let stage = 0;
        if (room.controller && room.controller.level > 1) {
            stage = 0;
        }

        switch (stage) {
            case 0:
                colonyExtras.colony.upgradeManagement.upgraderEnergy.requestedEnergyUsagePercentage = 0.5;
                this.manageUpgraders(colonyExtras);
                break;

            default:
                break;
        }
        
    }

    static manageUpgraders(colony: ColonyExtras) {
        if (!colony.colony.upgradeManagement.upgraders) {
            colony.colony.upgradeManagement.upgraders = this.createUpgraderProfile(colony);
        }

        const { upgraders, upgraderEnergy } = colony.colony.upgradeManagement;

        const energyUsagePerCreep = upgraders.memoryBlueprint.averageEnergyConsumptionProductionPerTick;
        upgraders.desiredAmount = Math.max(1, Math.floor(upgraderEnergy.allowedEnergyWorkRate / energyUsagePerCreep));

        SpawningSystem.run(colony, colony.colony.upgradeManagement.upgraders);
    }

    static createUpgraderProfile(colony: ColonyExtras) {
        const body: BodyPartConstant[] = [];

        body.push(WORK);
        body.push(CARRY);
        body.push(CARRY);
        body.push(MOVE);
        body.push(MOVE);

        const energyUsePerTick = UPGRADE_CONTROLLER_POWER * 1;

        const memory: AddCreepToQueueOptions = {
            workTargetId: colony.getMainRoom().controller?.id,
            workDuration: CARRY_CAPACITY * 2 / energyUsePerTick,
            averageEnergyConsumptionProductionPerTick: energyUsePerTick,
            role: 'upgrader'
        }

        const creepSpawnManagement: ColonyCreepSpawnManagement = {
            creepNames: [],
            desiredAmount: 1,
            bodyBlueprint: body,
            memoryBlueprint: memory
        }

        return creepSpawnManagement;
    }

    static runUpgraderCreep(creep: Creep) {
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.working = false;
            delete creep.memory.targetId;
            delete creep.memory.movementSystem.path;
            creep.say('u_harvesting');
        }
        if (!creep.memory.working && creep.store[RESOURCE_ENERGY] == creep.store.getCapacity()) {
            creep.memory.working = true;
            delete creep.memory.targetId;
            delete creep.memory.movementSystem.path;
            creep.say('upgrading');
        }
        if (creep.memory.working) {
            if (!creep.room.controller) {
                throw new Error(`${creep.id} - No room controller to upgrade: ${creep.room.name}`);
            }

            if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                MovementSystem.moveToWithReservation(creep, creep.room.controller, creep.memory.workDuration, 3);
            }
        }
        else {
            // Find energy
            EnergySystem.getEnergy(creep);
        }
    }
}