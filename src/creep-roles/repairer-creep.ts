import { CreepConstants } from 'constants/creep-constants';
import { CreepExtras } from 'prototypes/creep';
import { EnergySystem } from 'systems/energy-system';
import { MovementSystem } from 'systems/movement-system';

export class RepairerCreep extends CreepExtras {

    public constructor(creep: Creep) {
        super(creep);
    }

    public override run(): void {
        const { creep, memory } = this;
        const movementSystem = this.getMovementSystem();

        if (memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            memory.working = false;
            delete creep.memory.targetId;
            delete movementSystem.path;
            creep.say("r_refilling");
        }
        if (!memory.working && creep.store[RESOURCE_ENERGY] === creep.store.getCapacity()) {
            memory.working = true;
            delete memory.targetId;
            delete movementSystem.path;
            creep.say("r_working");
        }

        if (memory.working) {
            let target: AnyStructure | null = null;
            if (creep.memory.targetId) {
                target = Game.getObjectById(creep.memory.targetId);
                if (!target ||
                    (target.structureType !== STRUCTURE_EXTENSION  && target.structureType && target.hits && target.hitsMax && target.hits === target.hitsMax) ||
                    (target.structureType === STRUCTURE_EXTENSION && target.store.getFreeCapacity(RESOURCE_ENERGY) === 0)) {
                    delete creep.memory.targetId;
                    delete movementSystem.path;
                }
            } else {
                // Prioritizes refilling extension structures and then repairing structures
                let target: AnyStructure | ConstructionSite | null = null;
                target = creep.pos.findClosestByPath(
                    FIND_STRUCTURES,
                    {
                        filter: structure => {
                            return (
                                structure.structureType === STRUCTURE_EXTENSION &&
                                structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                            );
                        }
                    }
                );

                if (target) {
                    memory.targetId = target.id;
                } else {
                    const targets = creep.room.find(FIND_STRUCTURES, {
                        filter: object => object.hits < (object.hitsMax/4)
                    });

                    targets.sort((a,b) => a.hits - b.hits);

                    if (targets.length > 0) {
                        memory.targetId = targets[0].id;
                        target = Game.getObjectById(memory.targetId);
                    } else {
                        const colony = this.getColony();
                        if (!colony) {
                            console.log(`creep: ${creep.name}, missing colony`);
                        } else {
                            const buildQueue = colony.builderManagement.buildQueue;
                            if (buildQueue.length === 0) {
                                return;
                            }

                            creep.memory.targetId = buildQueue[0];
                            target = Game.getObjectById<ConstructionSite>(creep.memory.targetId);
                        }
                    }
                }
            }

            if (target) {
                if (creep.repair(target) !== OK &&
                    creep.transfer(target, RESOURCE_ENERGY) !== OK &&
                    creep.build(target as any as ConstructionSite) !== OK) {
                    MovementSystem.moveToWithReservation(creep, target, 5);
                }
            }
        } else {
            // find energy
            EnergySystem.getEnergy(creep);
        }

    }



}
