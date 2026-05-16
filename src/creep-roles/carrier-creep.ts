/* eslint-disable max-classes-per-file */
import { CreepRunner } from "prototypes/creep";
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { EnergyCalculator } from "utils/energy-calculator";

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
                } else {
                    // Fallback tow: pull miner until carrier is near source, then swap.
                    if (!this.creep.pos.isNearTo(miner)) {
                        this.moveToWithReservation(miner, 0);
                        return;
                    }
                    if (this.creep.pull(miner) === OK) {
                        if (this.creep.pos.isNearTo(source)) {
                            this.creep.move(this.creep.pos.getDirectionTo(miner));
                        } else {
                            this.moveToWithReservation(source, 0, 1);
                        }
                    }
                }
                return;
            }
        }

        // Standard Cycle
        if (memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            memory.working = false;
        }
        if (!memory.working && creep.store.getFreeCapacity() === 0) {
            memory.working = true;
        }

        // Logic check: if we are not working (gathering), but there's nothing left to gather
        // AND we have some energy, let's just go deliver it (to prevent idling).
        if (!memory.working && creep.store[RESOURCE_ENERGY] > 0) {
            const container = creep.room.find(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_CONTAINER && s.pos.inRangeTo(source.pos, 1),
            })[0] as StructureContainer;

            const dropped = creep.room.find(FIND_DROPPED_RESOURCES, {
                filter: r => r.resourceType === RESOURCE_ENERGY && r.pos.inRangeTo(source.pos, 3),
            });

            const hasContainerEnergy = container && container.store[RESOURCE_ENERGY] > 0;
            const hasDroppedEnergy = dropped.length > 0;

            if (!hasContainerEnergy && !hasDroppedEnergy) {
                // Nothing left to gather at the source, but we have some energy. Switch to working.
                memory.working = true;
            }
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

        const pullResult = this.creep.pull(miner);
        if (pullResult === OK) {
            // Swap Logic
            if (this.creep.pos.isEqualTo(targetPos)) {
                // We are at the target, but miner is adjacent. Swap with miner.
                // Clear path to allow manual move
                if (this.creep.memory.movementSystem) {
                    delete this.creep.memory.movementSystem.path;
                }
                this.creep.move(this.creep.pos.getDirectionTo(miner));
            } else {
                // Move carrier to target (pulling miner behind)
                if (this.creep.pos.isNearTo(targetPos)) {
                    // One step away from target. Pull miner and step onto target.
                    // Clear path to allow manual move
                    if (this.creep.memory.movementSystem) {
                        delete this.creep.memory.movementSystem.path;
                    }
                    this.creep.move(this.creep.pos.getDirectionTo(targetPos));
                } else {
                    this.moveToWithReservation({ pos: targetPos } as any, 0, 0);
                }
            }
        }
    }

    private gatherEnergy(source: Source, miner: Creep | undefined) {
        const { creep } = this;

        // Priority 1: Pick up from Container if exists
        const container = creep.room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER && s.pos.inRangeTo(source.pos, 1),
        })[0] as StructureContainer;

        if (container && container.store[RESOURCE_ENERGY] > 0) {
            if (this.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(container, 5);
            }
            return;
        }

        // Priority 2: Pick up Dropped Energy
        const dropped = creep.room.find(FIND_DROPPED_RESOURCES, {
            filter: r => r.resourceType === RESOURCE_ENERGY && r.pos.inRangeTo(source.pos, 3),
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
        const colony = this.getColony();

        // Priority 1: Spawns/Extensions (Local Room)
        let target: Structure | null = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: s =>
                (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
                s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
        });

        // Priority 2: Primary Storage (Colony Wide)
        if (!target && colony) {
            const primaryStorage = colony.getPrimaryStorage();
            if (primaryStorage && primaryStorage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                target = primaryStorage;
            }
        }

        // Priority 3: Towers (Local Room)
        if (!target) {
            target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
            });
        }

        if (target) {
            if (this.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(target, 5);
            }
        } else {
            // Fallback: Upgrade controller if full and no where to go
            if (creep.room.controller && creep.room.controller.my) {
                const result = this.upgradeController(creep.room.controller);
                if (result === ERR_NOT_IN_RANGE) {
                    this.moveToWithReservation(creep.room.controller, 5, 3);
                } else if (result === OK) {
                    // Say something to show we are falling back
                    creep.say("⚡ Upgrade");
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

        const source = Game.getObjectById<Source>(colonySource.sourceId);
        const dist = source ? EnergyCalculator.calculateTravelTime(colony.getMainSpawn().pos, source.pos) : 25;

        // Throughput needed: 10 energy/tick.
        // Round trip: (Dist * 2) + 5 buffer.
        // Buffer 1.2x for extra distance/idle/congestion
        const roundTrip = dist * 2 + 5;
        const requiredCapacity = 10 * roundTrip * 1.2;

        // Max possible parts based on energyCap
        // 1 CARRY (50) + 1 MOVE (50) = 100 energy per 2 parts
        const maxParts = Math.floor(energyCap / 100);
        const maxCapacityPossible = maxParts * 50;

        // Determine how many carriers we need. Favor fewer larger ones.
        const desiredAmount = Math.ceil(requiredCapacity / Math.min(maxCapacityPossible, 1000)); // Cap single carrier capacity at 1000 (20 parts)

        // Calculate capacity needed per carrier
        const capacityPerCarrier = Math.ceil(requiredCapacity / desiredAmount);
        let carryParts = Math.ceil(capacityPerCarrier / 50);

        // Ensure we don't exceed maxParts
        if (carryParts > maxParts) carryParts = maxParts;
        if (carryParts < 1) carryParts = 1;

        const body: BodyPartConstant[] = [];
        for (let i = 0; i < carryParts; i++) {
            body.push(CARRY);
            body.push(MOVE);
        }

        const memory: AddCreepToQueueOptions = {
            workTargetId: colonySource.sourceId,
            workAmount: 0,
            averageEnergyConsumptionProductionPerTick: 0,
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
