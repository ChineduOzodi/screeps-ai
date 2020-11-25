import { MovementSystem } from './movement-system';
import { CreepExtras } from './../prototypes/creep';
import { ColonyExtras } from "prototypes/colony";
import { SpawningSystem } from "./spawning-system";
import { EnergySystem } from './energy-system';

export class BuilderSystem {

    static run(colonyExtras: ColonyExtras) {
        const room = colonyExtras.getMainRoom();

        let stage = 0;
        if (room.controller && room.controller.level > 1) {
            stage = 0;
        }

        switch (stage) {
            case 0:
                this.manageBuilders(colonyExtras);
                break;

            default:
                break;
        }

    }

    static manageBuilders(colonyExtras: ColonyExtras) {
        if (!colonyExtras.colony.builderManagement.builders) {
            colonyExtras.colony.builderManagement.builders = this.createBuilderProfile(colonyExtras);
        }

        colonyExtras.colony.builderManagement.buildQueue = this.getConstructionSites(colonyExtras.colony).map(x => x.id);

        colonyExtras.colony.builderManagement.builders.desiredAmount = Math.min(3, colonyExtras.colony.builderManagement.buildQueue.length);

        SpawningSystem.run(colonyExtras, colonyExtras.colony.builderManagement.builders);
    }

    static getConstructionSites(colony: Colony) {
        const constructionSites = _.filter(Game.constructionSites, (site) => {
            return colony.rooms.find(x => site.room?.name === x.name);
        });

        return constructionSites;
    }

    static createBuilderProfile(colony: ColonyExtras) {
        const body: BodyPartConstant[] = [];

        body.push(WORK);
        body.push(CARRY);
        body.push(CARRY);
        body.push(MOVE);
        body.push(MOVE);

        const memory: AddCreepToQueueOptions = {
            workTargetId: colony.getMainRoom().controller?.id,
            workDuration: CARRY_CAPACITY * 2 / BUILD_POWER
        }
        const creepSpawnManagement: ColonyCreepSpawnManagement = {
            role: 'builder',
            creepNames: [],
            desiredAmount: 0,
            bodyBlueprint: body,
            memoryBlueprint: memory
        }

        return creepSpawnManagement;
    }

    static runBuilderCreep(creepExtras: CreepExtras) {
        const { creep } = creepExtras;
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
            creep.say('building');
        }
        if (creep.memory.working) {

            let target: ConstructionSite | null = null;
            if (creep.memory.targetId) {
                target = Game.getObjectById<ConstructionSite>(creep.memory.targetId);
                if (!target) {
                    delete creep.memory.targetId;
                    delete creep.memory.movementSystem.path;
                }
            } else {
                const buildQueue = creepExtras.getColony().builderManagement.buildQueue;
                if (buildQueue.length == 0) {
                    return;
                }

                creep.memory.targetId = buildQueue[0];
                target = Game.getObjectById<ConstructionSite>(creep.memory.targetId);
            }

            if (target) {
                if (creep.build(target) == ERR_NOT_IN_RANGE) {
                    MovementSystem.moveToWithReservation(creep, target, creep.memory.workDuration);
                }
            }
        }
        else {
            // Find energy
            EnergySystem.getEnergy(creep);
        }
    }
}