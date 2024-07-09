import { CreepRunner } from "prototypes/creep";
import { MovementSystem } from "systems/movement-system";

export class RepairerCreep extends CreepRunner {
    public constructor(creep: Creep) {
        super(creep);
    }

    public override onRun(): void {
        const { creep, memory } = this;

        if (this.switchFromWorkingToNotWorkingOutOfEnergy()) {
            creep.say("r: refilling");
        }

        if (this.switchFromNotWorkingToWorkingFullEnergy()) {
            creep.say("r: working");
        }

        if (memory.working) {
            let target = this.getTarget();
            if (target && (!this.targetNeedsRepair(target) || this.targetIsStructureExtensionFullEnergy(target))) {
                this.removeTarget();
                return;
            }

            let newTarget = false;

            if (!target) {
                target = this.findMostDamagedStructure(0.5);
                newTarget = true;
            }

            if (!target) {
                target = this.findClosestStructureExtension(1);
                newTarget = true;
            }

            if (!target) {
                target = this.getNextTargetInBuildQueue();
                newTarget = true;
            }

            if (newTarget) {
                delete creep.memory.movementSystem?.path;
                creep.memory.targetId = target?.id;
            }

            if (target) {
                if (
                    this.repair(target) !== OK &&
                    this.transfer(target, RESOURCE_ENERGY) !== OK &&
                    this.build(target as any as ConstructionSite) !== OK
                ) {
                    const t: AnyStructure = target as any;
                    const workDuration = t.structureType === STRUCTURE_EXTENSION ? 2 : memory.workAmount || 10;
                    const range = t.structureType === STRUCTURE_EXTENSION ? 1 : 3;
                    MovementSystem.moveToWithReservation(creep, target, workDuration, range);
                } else {
                    creep.say("acting");
                }
            }
        } else {
            // find energy
            this.getEnergy();
        }
    }
}
