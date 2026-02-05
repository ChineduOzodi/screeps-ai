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
        const colony = this.getColony();

        const sourceInfo = colony?.energyManagement?.sources.find((s: any) => s.sourceId === memory.workTargetId);

        // Reconstruct RoomPosition from memory object if necessary
        const miningPosObj = sourceInfo?.miningPosition;
        const miningPos = miningPosObj
            ? new RoomPosition(miningPosObj.x, miningPosObj.y, miningPosObj.roomName)
            : source?.pos;

        if (source) {
            // Logic:
            // 1. If we are NOT at miningPos (or source pos if undefined), try to get there.
            //    - If 0 MOVE parts, look for Carrier to pull us.
            //    - If we have MOVE parts, move there.
            // 2. Harvest.

            const targetPos = miningPos || source.pos;
            const atPosition = creep.pos.isEqualTo(targetPos);

            // If we are at the target position (or close enough if it's just source), we are good.
            // If miningPos is defined, we want exact match. If not, range 1 is ok.
            const inPosition = miningPos ? atPosition : creep.pos.inRangeTo(source, 1);

            if (inPosition) {
                this.harvest(source);
                // Ensure we don't accidentally move if we are working
            } else {
                // Not in position.
                // Harvest if possible while waiting (if in range of source but not on container)
                if (creep.pos.inRangeTo(source, 1)) {
                    this.harvest(source);
                }

                // Movement Logic
                if (creep.getActiveBodyparts(MOVE) === 0) {
                    // Turn towards carrier to accept pull
                    const carrier = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
                        filter: c =>
                            c.memory.role === CreepRole.CARRIER && c.memory.workTargetId === memory.workTargetId,
                    });
                    if (carrier) {
                        // We must call move(direction) to accept a pull.
                        // Even if we don't move, calling this with 0 fatigue is harmless (returns ERR_NO_BODYPART or OK if pulled)
                        creep.move(creep.pos.getDirectionTo(carrier));
                    } else {
                        creep.say("No Carrier!");
                    }
                } else {
                    // Use standard movement
                    if (targetPos) {
                        this.moveToWithReservation({ pos: targetPos }, memory.workDuration, 0, ["builder", "upgrader"]);
                    } else {
                        this.moveToWithReservation(source, memory.workDuration, 1, ["builder", "upgrader"]);
                    }
                }
            }
        } else {
            creep.say(`can't find source`);
        }
    }
}

export class MinerCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(energyBudgetRate: number, colony: ColonyManager): CreepProfiles {
        const colonySpawns: CreepProfiles = {};
        const spawn = colony.getMainSpawn();

        // Sort sources by distance to spawn
        const sortedSources = [...colony.systems.energy.systemInfo.sources].sort((a, b) => {
            const distA = EnergyCalculator.calculateTravelTime(spawn.pos, a.position);
            const distB = EnergyCalculator.calculateTravelTime(spawn.pos, b.position);
            return distA - distB;
        });

        // Use current energy for spawning if no harvesters exist to jumpstart
        let energyCap = spawn.room.energyCapacityAvailable;
        if (colony.systems.energy.noEnergyCollectors()) {
            energyCap = spawn.room.energyAvailable;
        }

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
