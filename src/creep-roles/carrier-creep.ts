/* eslint-disable max-classes-per-file */
import { CreepProfiles, CreepRole, CreepRunner } from "prototypes/creep";
import { ColonyManager } from "prototypes/colony";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { EnergyCalculator } from "utils/energy-calculator";
import { CreepConstants } from "constants/creep-constants";

export class CarrierCreep extends CreepRunner {
    public constructor(creep: Creep) {
        super(creep);
    }

    public override onRun(): void {
        const { creep, memory } = this;

        if (!memory.workTargetId) {
            creep.say("No target");
            return;
        }

        const source = Game.getObjectById<Source>(memory.workTargetId);
        if (!source) {
            creep.say("No Source");
            return;
        }

        // Identify Mining Position
        const colony = this.getColony();

        const sourceInfo = colony?.energyManagement?.sources.find((s: any) => s.sourceId === memory.workTargetId);
        const miningPosObj = sourceInfo?.miningPosition;
        const miningPos = miningPosObj
            ? new RoomPosition(miningPosObj.x, miningPosObj.y, miningPosObj.roomName)
            : undefined;

        // Check Miner
        const miner = creep.room
            .find(FIND_MY_CREEPS)
            .find(c => c.memory.role === CreepRole.MINER && c.memory.workTargetId === memory.workTargetId);

        // Tow Miner if needed
        if (miner) {
            let minerCorrectlyPlaced = false;
            // Precise check if miningPos known
            if (miningPos) {
                if (miner.pos.isEqualTo(miningPos)) {
                    minerCorrectlyPlaced = true;
                }
            } else {
                // Fallback check
                if (miner.pos.isNearTo(source)) {
                    minerCorrectlyPlaced = true;
                }
            }

            if (!minerCorrectlyPlaced) {
                if (miningPos) {
                    this.performTow(miner, miningPos);
                    return;
                } else {
                    creep.say("No MinePos");
                }
            }
        }

        // Standard Cycle
        if (memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            memory.working = false;
        }
        if (!memory.working && creep.store.getFreeCapacity() === 0) {
            memory.working = true;
        }

        if (memory.working) {
            this.deliverEnergy();
        } else {
            this.gatherEnergy(source, miner);
        }
    }

    private performTow(miner: Creep, targetPos: RoomPosition) {
        if (!this.creep.pos.isNearTo(miner)) {
            // Go to miner
            this.moveToWithReservation(miner, 0);
            return;
        }

        if (this.creep.pull(miner) === OK) {
            // Swap Logic
            if (this.creep.pos.isEqualTo(targetPos)) {
                this.creep.move(this.creep.pos.getDirectionTo(miner));
            } else {
                // Move carrier to target (pulling miner behind)
                if (this.creep.pos.isNearTo(targetPos)) {
                    this.creep.move(this.creep.pos.getDirectionTo(targetPos));
                } else {
                    this.moveToWithReservation({ pos: targetPos }, 0, 0);
                }
            }
        }
    }

    private gatherEnergy(source: Source, miner: Creep | undefined) {
        const { creep } = this;

        // Priority 1: Pick up from Container if exists
        const container = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => s.structureType === STRUCTURE_CONTAINER,
        })[0] as StructureContainer;

        if (container && container.store[RESOURCE_ENERGY] > 0) {
            if (this.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(container, 5);
            }
            return;
        }

        // Priority 2: Pick up Dropped Energy
        const dropped = source.pos.findInRange(FIND_DROPPED_RESOURCES, 3, {
            filter: r => r.resourceType === RESOURCE_ENERGY,
        });
        const highestDropped = dropped.sort((a, b) => b.amount - a.amount)[0];

        if (highestDropped) {
            if (this.pickup(highestDropped) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(highestDropped, 5);
            }
            return;
        }

        // Priority 3: Wait near source/container
        // If container exists but empty, wait near it?
        if (container) {
            if (!creep.pos.inRangeTo(container, 2)) {
                this.moveToWithReservation(container, 5);
            }
        } else {
            if (!creep.pos.inRangeTo(source, 2)) {
                this.moveToWithReservation(source, 5);
            }
        }

        // Idle near source if nothing to do?
        if (!creep.pos.inRangeTo(source, 2)) {
            this.moveToWithReservation(source, 5);
        }
    }

    private deliverEnergy() {
        const { creep } = this;
        // Priority: Spawns/Extensions -> Storage -> Other
        let target: Structure | null = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s =>
                (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
                s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
        });

        if (!target) {
            // Storage
            if (creep.room.storage && creep.room.storage.isActive()) {
                target = creep.room.storage;
            } else {
                const colony = this.getColony();
                if (colony && colony.containerId) {
                    target = Game.getObjectById(colony.containerId);
                }
            }
        }

        if (!target) {
            // Towers?
            target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
            });
        }

        if (target) {
            if (this.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(target, 5);
            }
        } else {
            // No dropoff? Upgrade controller? Or build?
            // Fallback: Upgrade controller if full and no where to go
            if (creep.room.controller) {
                if (this.transfer(creep.room.controller, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    this.moveToWithReservation(creep.room.controller, 5);
                } else {
                    // We can't transfer to controller, we must upgrade.
                    // But we are a carrier. We likely don't have WORK parts?
                    // Carrier body is CARRY/MOVE.
                    // So we can't upgrade.
                    // Just drop it? Or wait.
                    // creep.say("Full!");
                }
            }
        }
    }
}

export class CarrierCreepSpawner extends CreepSpawnerImpl {
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
            const priority = 10 - index;
            colonySpawns[`${CreepRole.CARRIER}-${colonySource.sourceId}`] = this.createProfile(
                energyCap,
                colonySource,
                colony,
                priority,
            );
        });
        return colonySpawns;
    }

    private createProfile(energyCap: number, colonySource: ColonySource, colony: ColonyManager, priority: number) {
        // Body: Heavy CARRY, good MOVE.
        // Ratio: 1 CARRY : 1 MOVE for Roads (full speed).
        // If we want to pull miner, we need MOVE parts.

        // Simple Logic: Half CARRY, Half MOVE.
        const totalParts = Math.floor(energyCap / 100);
        let parts = Math.min(totalParts, 20); // Cap at 20 (1000 energy) for now
        if (parts < 2) parts = 2; // Min body

        const body: BodyPartConstant[] = [];
        for (let i = 0; i < parts; i++) {
            body.push(CARRY);
            body.push(MOVE);
        }

        const source = Game.getObjectById<Source>(colonySource.sourceId);
        const dist = source ? EnergyCalculator.calculateTravelTime(colony.getMainSpawn().pos, source.pos) : 25;

        // Desired Amount?
        // 1 Carrier per source is usually enough if large enough.
        // If source is far or carrier is small, might need 2.
        // Throughput needed: 10 energy/tick.
        // Carrier capacity: parts * 50.
        // Round trip: (Dist * 1 * 2) + 2.
        // Capacity / RoundTrip >= 10?
        // Capacity >= 10 * RoundTrip.

        const roundTrip = dist * 2 + 5; // buffer
        const requiredCapacity = 10 * roundTrip;
        const oneCarrierCapacity = parts * 50;

        const desiredAmount = Math.ceil(requiredCapacity / oneCarrierCapacity);

        const memory: AddCreepToQueueOptions = {
            workTargetId: colonySource.sourceId,
            workAmount: 0,
            averageEnergyConsumptionProductionPerTick: 0, // It transfers, doesn't produce
            workDuration: 100,
            role: CreepRole.CARRIER,
        };
        const creepSpawnManagement: CreepSpawnerProfileInfo = {
            desiredAmount,
            bodyBlueprint: body,
            memoryBlueprint: memory,
            priority,
        };
        return creepSpawnManagement;
    }
}
