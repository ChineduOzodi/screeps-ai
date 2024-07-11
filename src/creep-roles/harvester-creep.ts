import { CreepRunner } from "prototypes/creep";
import { MovementSystem } from "systems/movement-system";

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
                if (this.harvest(source) === ERR_NOT_IN_RANGE) {
                    MovementSystem.moveToWithReservation(creep, source, memory.workDuration, undefined, [
                        "builder",
                        "upgrader"
                    ]);
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
                }
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
                    }
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
                    }
                });
            }
            if (target) {
                if (this.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    MovementSystem.moveToWithReservation(creep, target, 2);
                }
            }
        }
    }
}
