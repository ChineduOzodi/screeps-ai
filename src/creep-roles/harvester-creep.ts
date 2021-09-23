import { CreepConstants } from "constants/creep-constants";
import { CreepExtras } from "prototypes/creep";
import { MovementSystem } from "systems/movement-system";

export class HarvesterCreep extends CreepExtras {
    public constructor(creep: Creep) {
        super(creep);
    }

    private getColonySource(): ColonySource | undefined {
        return this.getColony()?.energyManagement.sources?.find(x =>
            x.harvesters?.creepNames.find(name => name === this.creep.name)
        );
    }

    public run(): void {
        // requirements
        const { creep, memory } = this;
        const colonySource = this.getColonySource();

        if (colonySource) {
            if (!colonySource.cumulativeHarvestingTime) {
                colonySource.cumulativeHarvestingTime = 0;
            }
            colonySource.cumulativeHarvestingTime += 1;
        }

        if (!memory.workTargetId) {
            throw new Error(`creep does not have sourceId in memory: ${creep.id}`);
        }

        if (memory.working && this.creep.store[RESOURCE_ENERGY] === creep.store.getCapacity()) {
            memory.working = false;
            creep.say("delivering");
        }
        if (!memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            memory.working = true;
            creep.say("harvesting");
        }

        if (memory.working) {
            const source = Game.getObjectById<Source>(memory.workTargetId);
            // console.log(target);
            // moves to target
            // moves to source
            if (source) {
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    MovementSystem.moveToWithReservation(creep, source, memory.workDuration);
                } else {
                    if (!memory.cumulativeWork) {
                        memory.cumulativeWork = 0;
                    }
                    if (!memory.workAmount) {
                        memory.workAmount = creep.body.filter(x => x.type === WORK).length;
                    }
                    memory.cumulativeWork += memory.workAmount * CreepConstants.WORK_PART_ENERGY_HARVEST_PER_TICK;
                    if (colonySource && this.memory.cumulativeWork) {
                        // Used to figure out energy harvesting efficiency
                        if (!colonySource.cumulativeHarvestedEnergy) {
                            colonySource.cumulativeHarvestedEnergy = 0;
                        }
                        colonySource.cumulativeHarvestedEnergy +=
                            memory.workAmount * CreepConstants.WORK_PART_ENERGY_HARVEST_PER_TICK;
                    }
                }
            } else {
                creep.say(`can't find source in room`);
            }
        } else {
            // finds closest storage / spawn to store energy
            let target: Structure | null = null;
            target = creep.pos.findClosestByPath<StructureExtension | StructureSpawn | StructureTower>(
                FIND_STRUCTURES,
                {
                    filter: structure => {
                        return (
                            (structure.structureType === STRUCTURE_EXTENSION ||
                                structure.structureType === STRUCTURE_SPAWN ||
                                structure.structureType === STRUCTURE_TOWER) &&
                            structure.energy < structure.energyCapacity
                        );
                    }
                }
            );

            if (!target) {
                target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: structure => {
                        return (
                            (structure.structureType === STRUCTURE_CONTAINER ||
                                structure.structureType === STRUCTURE_STORAGE) &&
                            structure.store.getFreeCapacity() > 0
                        );
                    }
                });
            }
            // console.log(target.id);
            if (target) {
                if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    MovementSystem.moveToWithReservation(creep, target, 2);
                }
            }
        }
    }
}
