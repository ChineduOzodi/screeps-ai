/* eslint-disable max-classes-per-file */
import { CreepProfiles, CreepRole, CreepRunner } from "prototypes/creep";
import { ColonyManager } from "prototypes/colony";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";

const MAX_BUILDERS = 3;

const BASE_BUILDER_BODY: BodyPartConstant[] = [WORK, CARRY, CARRY, MOVE, MOVE];
const BASE_BUILDER_COST: number = CreepSpawnerImpl.getSpawnBodyEnergyCost(BASE_BUILDER_BODY);
const BASE_BUILDER_COST_PER_TICK = CreepSpawnerImpl.getSpawnBodyEnergyCostPerTick(BASE_BUILDER_BODY);
const MIN_BUILDER_BODY: BodyPartConstant[] = [WORK, CARRY, MOVE];
const MIN_BUILDER_COST: number = CreepSpawnerImpl.getSpawnBodyEnergyCost(MIN_BUILDER_BODY);
const MIN_BUILDER_COST_PER_TICK = CreepSpawnerImpl.getSpawnBodyEnergyCostPerTick(MIN_BUILDER_BODY);

export class BuilderCreep extends CreepRunner {
    public override onRun(): void {
        this.runBuilderCreep();
    }

    public runBuilderCreep(): void {
        const { creep } = this;
        const movementSystem = this.getMovementSystem();
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
                const colony = this.getColony();
                if (!colony) {
                    console.log(`builder-system | creep: ${creep.name}, missing colony`);
                } else {
                    const buildQueue = colony.builderManagement?.buildQueue || [];
                    if (buildQueue.length === 0) {
                        return;
                    }

                    creep.memory.targetId = buildQueue[0];
                    target = Game.getObjectById<ConstructionSite>(creep.memory.targetId);
                }
            }

            if (target) {
                if (this.build(target) === ERR_NOT_IN_RANGE) {
                    this.moveToWithReservation(target, creep.memory.workDuration, 3);
                }
            }
        } else {
            // Find energy
            this.getEnergy();
        }
    }
}

export class BuilderCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(energyCap: number, colony: ColonyManager): CreepProfiles {
        // Fallback to empty queue if builderManagement is not initialized
        const buildQueue = colony.colonyInfo.builderManagement?.buildQueue || [];
        const profile = this.createProfile(energyCap, colony);
        if (buildQueue.length === 0) {
            profile.desiredAmount = 0;
        }

        const profiles: CreepProfiles = {};
        profiles[CreepRole.BUILDER] = profile;
        return profiles;
    }

    private createProfile(energyCap: number, colony: ColonyManager): CreepSpawnerProfileInfo {
        const energyCapacityAvailable = colony.getMainSpawn().room.energyCapacityAvailable;
        let body: BodyPartConstant[] = [];
        const energyUsagePerCreep = -colony.getTotalEstimatedEnergyFlowRate(CreepRole.BUILDER);
        let bodyCost = 0;
        let bodyMultiplier = 0;
        let bodyMultiplierPerTick = 0;

        if (energyCapacityAvailable < BASE_BUILDER_COST) {
            bodyCost = MIN_BUILDER_COST;
            bodyMultiplier = Math.floor(energyCapacityAvailable / bodyCost);
            bodyMultiplierPerTick = Math.floor(energyCap / (MIN_BUILDER_COST_PER_TICK + energyUsagePerCreep));
            body = CreepSpawnerImpl.multiplyBody(MIN_BUILDER_BODY, Math.min(bodyMultiplier, bodyMultiplierPerTick));
        } else {
            bodyCost = BASE_BUILDER_COST;
            bodyMultiplier = Math.floor(energyCapacityAvailable / bodyCost);
            bodyMultiplierPerTick = Math.floor(energyCap / (BASE_BUILDER_COST_PER_TICK + energyUsagePerCreep));
            body = CreepSpawnerImpl.multiplyBody(BASE_BUILDER_BODY, Math.min(bodyMultiplier, bodyMultiplierPerTick));
        }
        const workCount = body.filter(x => x === WORK).reduce((a, b) => a + 1, 0);
        const carryCount = body.filter(x => x === CARRY).reduce((a, b) => a + 1, 0);
        const energyUsePerTick = BUILD_POWER * workCount;

        const memory: AddCreepToQueueOptions = {
            workDuration: (CARRY_CAPACITY * carryCount) / energyUsePerTick,
            role: CreepRole.BUILDER,
            averageEnergyConsumptionProductionPerTick: energyUsePerTick,
        };
        const creepSpawnManagement: CreepSpawnerProfileInfo = {
            bodyBlueprint: body,
            memoryBlueprint: memory,
            desiredAmount: Math.max(
                1,
                Math.min(
                    MAX_BUILDERS,
                    Math.floor(bodyMultiplierPerTick / Math.min(bodyMultiplier, bodyMultiplierPerTick)),
                ),
            ),
        };

        return creepSpawnManagement;
    }
}
