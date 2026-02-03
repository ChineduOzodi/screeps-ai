/* eslint-disable max-classes-per-file */
import { CreepProfiles, CreepRole, CreepRunner } from "prototypes/creep";
import { ColonyManager } from "prototypes/colony";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { EnergyCalculator } from "utils/energy-calculator";

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
    public onCreateProfiles(energyBudgetRate: number, colony: ColonyManager): CreepProfiles {
        // Fallback to empty queue if builderManagement is not initialized
        const buildQueue = colony.colonyInfo.builderManagement?.buildQueue || [];

        if (buildQueue.length === 0) {
            const emptyProfiles: CreepProfiles = {};
            emptyProfiles[CreepRole.BUILDER] = {
                desiredAmount: 0,
                bodyBlueprint: [],
                memoryBlueprint: {
                    averageEnergyConsumptionProductionPerTick: 0,
                    role: CreepRole.BUILDER,
                } as any,
                spawnCostPerTick: 0,
            };
            return emptyProfiles;
        }

        // Find dropoff/pickup (Source or Storage)
        const room = colony.getMainRoom();

        // If storage exists, use that. Else find closest source.
        let sourcePos = room.storage?.pos;
        if (!sourcePos) {
            const sources = colony.systems.energy.systemInfo.sources;
            if (sources && sources.length > 0) {
                // Pick first source for estimation
                const p = sources[0].position;
                sourcePos = new RoomPosition(p.x, p.y, p.roomName);
            }
        }

        if (!sourcePos) return {};

        // Find Construction Site (First in queue)
        let workPos = sourcePos;
        const siteId = buildQueue[0];
        const site = Game.getObjectById<ConstructionSite>(siteId);
        if (site) workPos = site.pos;

        const distToSource = EnergyCalculator.calculateTravelTime(workPos, sourcePos);

        // Body Logic
        const energyCap = room.energyCapacityAvailable;
        const body = this.createBuilderBody(energyCap);

        const consumptionPerTick = EnergyCalculator.calculateWorkerConsumptionPerTick(body, distToSource, 5); // 5 energy per tick per work (build)

        let desiredAmount = 0;
        if (consumptionPerTick > 0 && energyBudgetRate > 0) {
            desiredAmount = Math.floor(energyBudgetRate / consumptionPerTick);
        }

        // Cap reasonable builders
        desiredAmount = Math.min(desiredAmount, 3);

        const memory: AddCreepToQueueOptions = {
            workDuration: 1500,
            role: CreepRole.BUILDER,
            averageEnergyConsumptionProductionPerTick: consumptionPerTick,
        };
        const creepSpawnManagement: CreepSpawnerProfileInfo = {
            bodyBlueprint: body,
            memoryBlueprint: memory,
            desiredAmount,
        };

        const profiles: CreepProfiles = {};
        profiles[CreepRole.BUILDER] = creepSpawnManagement;
        return profiles;
    }

    private createBuilderBody(energyCap: number): BodyPartConstant[] {
        // [WORK, CARRY, CARRY, MOVE, MOVE] = 300
        const unitCost = 300;
        const maxUnits = Math.floor(energyCap / unitCost);
        const units = Math.min(maxUnits, 10);

        const body: BodyPartConstant[] = [];
        for (let i = 0; i < units; i++) {
            body.push(WORK);
            body.push(CARRY);
            body.push(CARRY);
            body.push(MOVE);
            body.push(MOVE);
        }

        // Fallback for small rooms
        if (body.length === 0) return [WORK, CARRY, MOVE]; // 200 cost

        return body;
    }
}
