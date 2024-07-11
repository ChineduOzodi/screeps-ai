import { CreepRunner } from "prototypes/creep";
import { MovementSystem } from "systems/movement-system";

export class DefenderCreep extends CreepRunner {

  public override onRun(): void {
    this.runDefenderCreep();
  }

  public runDefenderCreep(): void {
    const creep = this.creep;

    let target = this.getTarget();
    let newTarget = false;

    if (!target) {
      target = this.findClosestHostile();
    }

    if (newTarget) {
      delete creep.memory.movementSystem?.path;
      creep.memory.targetId = target?.id;
    }

    if (target) {
      if (this.attack(target) === ERR_NOT_IN_RANGE) {
        MovementSystem.moveToWithReservation(creep, target, creep.memory.workDuration);
      }
    }
  }
}
