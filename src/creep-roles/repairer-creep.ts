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
                if (!target) {
                    delete creep.memory.targetId;
                    delete movementSystem.path;
                }
            } else {
                const targets = creep.room.find(FIND_STRUCTURES, {
                    filter: object => object.hits < (object.hitsMax/4)
                });

                targets.sort((a,b) => a.hits - b.hits);

                if (targets.length > 0) {
                    memory.targetId = targets[0].id;
                    target = Game.getObjectById(memory.targetId);
                }
            }

            if (target) {
                if (creep.repair(target) === ERR_NOT_IN_RANGE) {
                    MovementSystem.moveToWithReservation(creep, target, memory.workDuration, 3);
                }
            }
        } else {
            // find energy
            EnergySystem.getEnergy(creep);
        }

    }



}
