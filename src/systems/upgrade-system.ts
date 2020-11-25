import { EnergySystem } from 'systems/energy-system';
import { MovementSystem } from './movement-system';
import { CreepConstants } from 'constants/creep-constants';
import { ColonyExtras } from './../prototypes/colony';
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

        SpawningSystem.run(colony, colony.colony.upgradeManagement.upgraders);
    }

    static createUpgraderProfile(colony: ColonyExtras) {
        const body: BodyPartConstant[] = [];

        body.push(WORK);
        body.push(CARRY);
        body.push(CARRY);
        body.push(MOVE);
        body.push(MOVE);

        const memory: AddCreepToQueueOptions = {
            workTargetId: colony.getMainRoom().controller?.id,
            workDuration: CreepConstants.CARRY_PART_RESOURCE_AMOUNT * 2 / 1
        }
        const creepSpawnManagement: ColonyCreepSpawnManagement = {
            role: 'upgrader',
            creepNames: [],
            desiredAmount: 2,
            bodyBlueprint: body,
            memoryBlueprint: memory
        }

        return creepSpawnManagement;
    }

    static runEnergyCreep(creep: Creep) {
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.working = false;
            delete creep.memory.targetId;
            delete creep.memory.movementSystem.path;
            creep.say('b_harvesting');
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