/* eslint-disable max-classes-per-file */
import { CreepProfiles, CreepRole, CreepRunner } from "prototypes/creep";

import { ColonyManager } from "prototypes/colony";
import { CreepConstants } from "constants/creep-constants";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { EnergyCalculator } from "utils/energy-calculator";

export class MinerCreep extends CreepRunner {
    public constructor(creep: Creep) {
        super(creep);
    }

    public override onRun(): void {
        const { creep, memory } = this;

        if (!memory.workTargetId) {
            throw new Error(`creep does not have sourceId in memory: ${creep.id}`);
        }

        const source = Game.getObjectById<Source>(memory.workTargetId);

        if (source) {
            if (creep.pos.getRangeTo(source) <= 1) {
                // We are in position (mostly).
                // Ensure we are ON the container if it exists?

                // Harvest
                this.harvest(source);
                // Miner with no CARRY parts will drop energy on the ground or into a container automatically.
            } else {
                // If not in range and has no move parts, we need to be pulled
                if (creep.getActiveBodyparts(MOVE) === 0) {
                    const carrier = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
                        filter: c =>
                            c.memory.role === CreepRole.CARRIER && c.memory.workTargetId === memory.workTargetId,
                    });
                    if (carrier) {
                        // Carrier will handle the pull logic, we just need to be compliant?
                        // Actually, if carrier pulls, we need to move?
                        // "The target creep must yield to the puller by also calling move method in the direction of the puller."
                        if (creep.move(carrier) !== OK) {
                            // Log or handle error
                        }
                    } else {
                        creep.say("No Carrier!");
                    }
                } else {
                    // Fallback if we accidentally have move parts
                    this.moveToWithReservation(source, memory.workDuration, undefined, ["builder", "upgrader"]);
                }
            }
        } else {
            creep.say(`can't find source`);
        }
    }
}

export class MinerCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(energyCap: number, colony: ColonyManager): CreepProfiles {
        const colonySpawns: CreepProfiles = {};
        const spawn = colony.getMainSpawn();

        // Sort sources by distance to spawn
        const sortedSources = [...colony.systems.energy.systemInfo.sources].sort((a, b) => {
            const distA = EnergyCalculator.calculateTravelTime(spawn.pos, a.position);
            const distB = EnergyCalculator.calculateTravelTime(spawn.pos, b.position);
            return distA - distB;
        });

        sortedSources.forEach((colonySource, index) => {
            if (!colonySource.accessCount) {
                colonySource.accessCount = 1;
            }
            const priority = 10 - index;
            colonySpawns[`${CreepRole.MINER}-${colonySource.sourceId}`] = this.createProfile(
                energyCap,
                colonySource,
                priority,
            );
        });
        return colonySpawns;
    }

    private createProfile(energyCap: number, colonySource: ColonySource, priority: number) {
        // Max 5 WORK parts = 10 energy/tick = 3000 energy / 300 ticks. Perfect for standard source.
        // If owned room, 6-7 might be safer for center rooms?
        // Let's aim for 5 or 6.
        // 5 WORK = 500 energy.
        // We do NOT add MOVE parts.
        // We do NOT add CARRY parts (User request).

        let workPartCount = Math.floor(energyCap / 100);
        if (workPartCount > 6) workPartCount = 6;
        if (workPartCount < 1) workPartCount = 1;

        const body: BodyPartConstant[] = [];
        for (let i = 0; i < workPartCount; i++) {
            body.push(WORK);
        }

        const memory: AddCreepToQueueOptions = {
            workTargetId: colonySource.sourceId,
            workAmount: workPartCount,
            averageEnergyConsumptionProductionPerTick: workPartCount * CreepConstants.WORK_PART_ENERGY_HARVEST_PER_TICK,
            workDuration: 100, // Stationary, lives a long time
            role: CreepRole.MINER,
        };
        const creepSpawnManagement: CreepSpawnerProfileInfo = {
            desiredAmount: 1, // Only 1 miner per source
            bodyBlueprint: body,
            memoryBlueprint: memory,
            priority,
        };
        return creepSpawnManagement;
    }
}
