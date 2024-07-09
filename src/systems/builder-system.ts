import { ColonyExtras } from "prototypes/colony";
import { CreepRunner } from "./../prototypes/creep";
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
        if (!colonyExtras.colonyInfo.builderManagement.builders) {
            colonyExtras.colonyInfo.builderManagement.builders = this.createBuilderProfile(colonyExtras);
        }
        colonyExtras.colonyInfo.builderManagement.buildQueue = this.getConstructionSites(colonyExtras.colonyInfo).map(
            x => x.id
        );
        const { buildQueue, builderEnergy, builders } = colonyExtras.colonyInfo.builderManagement;
        if (buildQueue.length > 0) {
            builderEnergy.requestedEnergyUsagePercentage = 0.5;
            const energyUsagePerCreep = builders.memoryBlueprint.averageEnergyConsumptionProductionPerTick;
            builders.desiredAmount = Math.max(1, Math.floor(builderEnergy.allowedEnergyWorkRate / energyUsagePerCreep));
        } else {
            builderEnergy.requestedEnergyUsagePercentage = 0;
            builders.desiredAmount = 0;
        }

        SpawningSystem.run(colonyExtras, colonyExtras.colonyInfo.builderManagement.builders);
    }

    public static getConstructionSites(colony: Colony): ConstructionSite<BuildableStructureConstant>[] {
        const constructionSites: ConstructionSite<BuildableStructureConstant>[] = [];
        for (const name in Game.constructionSites) {
            const site = Game.constructionSites[name];

            if (colony.rooms.find(x => site.room?.name === x.name)) {
                constructionSites.push(site);
            }
        }

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

    public static runBuilderCreep(creepExtras: CreepRunner): void {
        const { creep } = creepExtras;
        const movementSystem = creepExtras.getMovementSystem();
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
            delete creep.memory.targetId;
            delete movementSystem.path;
            creep.say("b: harvesting");
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
                    console.log(`builder-system | creep: ${creep.name}, missing colony`);
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
