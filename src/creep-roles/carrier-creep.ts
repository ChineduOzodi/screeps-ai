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
        // Logic:
        // 1. Check if we need to pull our Miner to the source.
        // 2. If Miner is OK, do Transport Cycle.

        if (!memory.workTargetId) {
            // Fallback or error
            creep.say("No target");
            return;
        }

        const source = Game.getObjectById<Source>(memory.workTargetId);
        if (!source) {
            creep.say("No Source");
            return;
        }

        // 1. Check Miner Position
        // Find Miner assigned to this source
        const miner = creep.room
            .find(FIND_MY_CREEPS)
            .find(c => c.memory.role === CreepRole.MINER && c.memory.workTargetId === memory.workTargetId);

        if (miner) {
            // Is miner at source?
            if (!miner.pos.isNearTo(source)) {
                // Miner needs pulling
                // State: "Pulling"
                if (creep.pull(miner) === ERR_NOT_IN_RANGE) {
                    this.moveToWithReservation(miner, 5); // Go to miner to pull
                } else {
                    // Pulled successfully, now move towards source
                    const moveRes = miner.move(creep);
                    const myMove = this.moveToWithReservation(source, 5);
                    // Note: 'pull' returns OK, we also need to move.
                    // moveToWithReservation might handle the move.

                    if (moveRes !== OK) {
                        // Miner couldn't move?
                    }
                }
                return; // Priority is positioning the miner
            }
        }

        // 2. Transport Cycle
        if (memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            memory.working = false; // Need to gather
        }
        if (!memory.working && creep.store.getFreeCapacity() === 0) {
            memory.working = true; // Need to deliver
        }

        if (memory.working) {
            // DELIVER
            this.deliverEnergy();
        } else {
            // GATHER
            this.gatherEnergy(source, miner);
        }
    }

    private gatherEnergy(source: Source, miner: Creep | undefined) {
        const { creep } = this;

        // Priority 1: Pick up from Container if exists
        // (We can check 'workTargetId' associated container in memory if we stored it, or search)
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
        const dropped = source.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
            filter: r => r.resourceType === RESOURCE_ENERGY,
        })[0];

        if (dropped) {
            if (this.pickup(dropped) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(dropped, 5);
            }
            return;
        }

        // Priority 3: Withdraw from Miner (Dead code: Miner has no CARRY parts)
        // Kept empty or removed.

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
            if (creep.room.storage && creep.room.storage.store.getFreeCapacity() > 0) {
                target = creep.room.storage;
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
