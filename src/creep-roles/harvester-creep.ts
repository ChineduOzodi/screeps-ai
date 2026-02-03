/* eslint-disable max-classes-per-file */
import { CreepProfiles, CreepRole, CreepRunner } from "prototypes/creep";
import { ColonyManager } from "prototypes/colony";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { EnergyCalculator } from "utils/energy-calculator";

export class HarvesterCreep extends CreepRunner {
    public constructor(creep: Creep) {
        super(creep);
    }

    public override onRun(): void {
        const { creep, memory } = this;

        if (!memory.workTargetId) {
            throw new Error(`creep does not have sourceId in memory: ${creep.id}`);
        }

        if (memory.working && this.creep.store[RESOURCE_ENERGY] === creep.store.getCapacity()) {
            memory.working = false;
        }
        if (!memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            memory.working = true;
        }

        if (memory.working) {
            const source = Game.getObjectById<Source>(memory.workTargetId);
            // console.log(target);
            // moves to target
            // moves to source
            if (source) {
                if (this.harvest(source) === ERR_NOT_IN_RANGE) {
                    this.moveToWithReservation(source, memory.workDuration, undefined, ["builder", "upgrader"]);
                }
            } else {
                creep.say(`can't find source in room`);
            }
        } else {
            // finds closest storage / spawn to store energy
            let target: Structure | null = null;
            target = creep.pos.findClosestByPath<StructureExtension | StructureSpawn>(FIND_STRUCTURES, {
                filter: structure => {
                    return (
                        (structure.structureType === STRUCTURE_EXTENSION ||
                            structure.structureType === STRUCTURE_SPAWN) &&
                        structure.store[RESOURCE_ENERGY] < structure.store.getCapacity(RESOURCE_ENERGY)
                    );
                },
            });

            // StructureTower has lower priority than extensions and spawn so as not to
            // accidentally starve creep generation.
            if (!target) {
                target = creep.pos.findClosestByPath<StructureTower>(FIND_STRUCTURES, {
                    filter: structure => {
                        return (
                            structure.structureType === STRUCTURE_TOWER &&
                            structure.store[RESOURCE_ENERGY] < structure.store.getCapacity(RESOURCE_ENERGY)
                        );
                    },
                });
            }

            if (!target) {
                target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: structure => {
                        return (
                            (structure.structureType === STRUCTURE_CONTAINER ||
                                structure.structureType === STRUCTURE_STORAGE) &&
                            structure.store.getFreeCapacity() > 0
                        );
                    },
                });
            }
            if (target && this.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(target, 2);
            } else {
                // If no storage target, try to build first
                const constructionSite = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES);
                if (constructionSite) {
                    if (this.build(constructionSite) === ERR_NOT_IN_RANGE) {
                        this.moveToWithReservation(constructionSite, creep.memory.workDuration, 3);
                    }
                } else if (
                    creep.room.controller &&
                    this.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE
                ) {
                    this.moveToWithReservation(creep.room.controller, creep.memory.workDuration, 3);
                }
            }
        }
    }
}

export class HarvesterCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(_energyRateCap: number, colony: ColonyManager): CreepProfiles {
        const profiles: CreepProfiles = {};
        for (const colonySource of colony.systems.energy.systemInfo.sources) {
            const spawn = colony.getMainSpawn();
            const profileName = `${CreepRole.HARVESTER}-${colonySource.sourceId}`;
            // Use current energy for spawning if no harvesters exist to jumpstart
            let energy = spawn.room.energyCapacityAvailable;
            if (colony.systems.energy.noEnergyCollectors()) {
                energy = spawn.room.energyAvailable;
            }
            profiles[profileName] = this.createHarvesterProfile(spawn, colonySource, energy, colony);
        }
        return profiles;
    }

    private createHarvesterProfile(
        spawn: StructureSpawn,
        colonySource: ColonySource,
        energyCap: number,
        colony: ColonyManager,
    ): CreepSpawnerProfileInfo {
        const { sourceId, accessCount } = colonySource;
        const source = Game.getObjectById<Source>(sourceId);
        if (!source) {
            throw new Error(`Source not found with given id: ${sourceId}`);
        }

        // Determine Dropoff
        let dropoff: Structure | null = null;
        if (colony.colonyInfo.containerId) {
            const container = Game.getObjectById<StructureContainer>(colony.colonyInfo.containerId);
            if (container) dropoff = container;
        }
        // Fallback to spawn if no container/storage
        if (!dropoff && colony.getMainRoom().storage) dropoff = colony.getMainRoom().storage || null;
        if (!dropoff) dropoff = spawn;

        // Pathing
        const distToSource = EnergyCalculator.calculateTravelTime(dropoff.pos, source.pos);
        const distToDropoff = distToSource; // Round trip assumption

        // Optimize Body
        const bestBody = this.findBestHarvesterBody(energyCap, distToSource, distToDropoff);
        const productionPerTick = EnergyCalculator.calculateHarvesterProductionPerTick(
            bestBody,
            distToSource,
            distToDropoff,
        );

        // Calculate Desired Amount
        // Limit 1: Source Regeneration (3000 energy / 300 ticks = 10 energy/tick, or 4000/300 if center room)
        const sourceRegen = source.energyCapacity / ENERGY_REGEN_TIME;
        const requiredCreepsForRegen = productionPerTick > 0 ? Math.ceil(sourceRegen / productionPerTick) : 0;

        // Limit 2: Available Slots
        // If no storage, leave room for other roles? User said "Before first storage... share... After... max out"
        // For now, hard cap at accessCount.
        // TODO: Dynamic "sharing" logic if needed.
        const maxCreepsBySlots = accessCount;

        const desiredAmount = Math.min(requiredCreepsForRegen, maxCreepsBySlots);

        const memory: AddCreepToQueueOptions = {
            workTargetId: source.id,
            workAmount: bestBody.filter(p => p === WORK).length,
            averageEnergyConsumptionProductionPerTick: productionPerTick,
            // Estimated time: Fill up -> Travel -> Drop -> Travel back
            workDuration: 1500, // Just use lifetime for now, or re-calculate cycle?
            role: CreepRole.HARVESTER,
        };

        return {
            desiredAmount,
            bodyBlueprint: bestBody,
            memoryBlueprint: memory,
            priority: 9,
        };
    }

    private findBestHarvesterBody(energyCap: number, distToSource: number, distToDropoff: number): BodyPartConstant[] {
        // Simple optimization: Try different ratios of WORK/CARRY/MOVE
        // For a harvester traveling:
        // Needs MOVE to move (1 MOVE per 2 parts on road, 1 per 1 on plain/swamp)
        // Needs WORK to harvest.
        // Needs CARRY to transport.
        // Strategy: Iterate increasing size.

        let bestBody: BodyPartConstant[] = [WORK, CARRY, MOVE];
        let bestRate = 0;

        // Try various configurations. This is a heuristic search.
        // Build base unit: [WORK, CARRY, MOVE] costs 200.
        // Or [WORK, CARRY, CARRY, MOVE, MOVE] costs 300.
        // We iterate "scale" of body.

        // Heuristic: 1 WORK, N CARRY, M MOVE?
        // Since we travel, CARRY is important.

        // Let's just try scaling a balanced transport harvester body
        // [WORK, CARRY, CARRY, MOVE, MOVE] (Cost 300) -> Good for moving
        // [WORK, WORK, CARRY, MOVE] (Cost 300) -> Slower?

        // Brute force "reasonable" combinations?
        // Let's stick to the previous iterative logic but properly evaluating with EnergyCalculator

        const work = 1;
        const carry = 1;
        const move = 1;

        // Max parts 50
        for (let w = 1; w <= 5; w++) {
            // Don't need too many work parts if traveling far, mostly need carry
            for (let c = 1; c <= 20; c++) {
                for (let m = 1; m <= 20; m++) {
                    const cost = w * 100 + c * 50 + m * 50;
                    if (cost > energyCap) break;
                    if (w + c + m > 50) break;

                    const body: BodyPartConstant[] = [];
                    for (let i = 0; i < w; i++) body.push(WORK);
                    for (let i = 0; i < c; i++) body.push(CARRY);
                    for (let i = 0; i < m; i++) body.push(MOVE);

                    const rate = EnergyCalculator.calculateHarvesterProductionPerTick(
                        body,
                        distToSource,
                        distToDropoff,
                    );
                    if (rate > bestRate) {
                        bestRate = rate;
                        bestBody = body;
                    }
                }
            }
        }
        return bestBody;
    }
}
