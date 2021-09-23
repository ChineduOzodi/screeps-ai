import { ColonyExtras } from "prototypes/colony";
import { CreepExtras } from "./../prototypes/creep";
import { EnergySystem } from "./energy-system";
import { MovementSystem } from "./movement-system";
import { SpawningSystem } from "./spawning-system";

export class BuilderSystem {
    public static run(colonyExtras: ColonyExtras): void {
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

    public static manageBuilders(colonyExtras: ColonyExtras): void {
        if (!colonyExtras.colony.builderManagement.builders) {
            colonyExtras.colony.builderManagement.builders = this.createBuilderProfile(colonyExtras);
        }
        colonyExtras.colony.builderManagement.buildQueue = this.getConstructionSites(colonyExtras.colony).map(
            x => x.id
        );
        const { buildQueue, builderEnergy, builders } = colonyExtras.colony.builderManagement;
        if (buildQueue.length > 0) {
            builderEnergy.requestedEnergyUsagePercentage = 0.5;
            const energyUsagePerCreep = builders.memoryBlueprint.averageEnergyConsumptionProductionPerTick;
            builders.desiredAmount = Math.max(1, Math.floor(builderEnergy.allowedEnergyWorkRate / energyUsagePerCreep));
        } else {
            builderEnergy.requestedEnergyUsagePercentage = 0;
            builders.desiredAmount = 0;
        }

        SpawningSystem.run(colonyExtras, colonyExtras.colony.builderManagement.builders);
    }

    public static getConstructionSites(colony: Colony): ConstructionSite<BuildableStructureConstant>[] {
        const constructionSites = _.filter(Game.constructionSites, site => {
            return colony.rooms.find(x => site.room?.name === x.name);
        });

        return constructionSites;
    }

    public static createBuilderProfile(colony: ColonyExtras): ColonyCreepSpawnManagement {
        const body: BodyPartConstant[] = [];

        body.push(WORK);
        body.push(CARRY);
        body.push(CARRY);
        body.push(MOVE);
        body.push(MOVE);

        const energyUsePerTick = BUILD_POWER * 1;

        const memory: AddCreepToQueueOptions = {
            workTargetId: colony.getMainRoom().controller?.id,
            workDuration: (CARRY_CAPACITY * 2) / energyUsePerTick,
            role: "builder",
            averageEnergyConsumptionProductionPerTick: energyUsePerTick
        };
        const creepSpawnManagement: ColonyCreepSpawnManagement = {
            creepNames: [],
            desiredAmount: 0,
            bodyBlueprint: body,
            memoryBlueprint: memory
        };

        return creepSpawnManagement;
    }

    public static runBuilderCreep(creepExtras: CreepExtras): void {
        const { creep } = creepExtras;
        const movementSystem = creepExtras.getMovementSystem();
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
            delete creep.memory.targetId;
            delete movementSystem.path;
            creep.say("b_harvesting");
        }
        if (!creep.memory.working && creep.store[RESOURCE_ENERGY] === creep.store.getCapacity()) {
            creep.memory.working = true;
            delete creep.memory.targetId;
            delete movementSystem.path;
            creep.say("building");
        }
        if (creep.memory.working) {
            let target: ConstructionSite | null = null;
            if (creep.memory.targetId) {
                target = Game.getObjectById<ConstructionSite>(creep.memory.targetId);
                if (!target) {
                    delete creep.memory.targetId;
                    delete movementSystem.path;
                }
            } else {
                const colony = creepExtras.getColony();
                if (!colony) {
                    console.log(`builder-system | creep: ${creep.id}, missing colony`);
                } else {
                    const buildQueue = colony.builderManagement.buildQueue;
                    if (buildQueue.length === 0) {
                        return;
                    }

                    creep.memory.targetId = buildQueue[0];
                    target = Game.getObjectById<ConstructionSite>(creep.memory.targetId);
                }
            }

            if (target) {
                if (creep.build(target) === ERR_NOT_IN_RANGE) {
                    MovementSystem.moveToWithReservation(creep, target, creep.memory.workDuration, 3);
                }
            }
        } else {
            // Find energy
            EnergySystem.getEnergy(creep);
        }
    }
}
