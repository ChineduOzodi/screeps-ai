import { CreepRunner } from "prototypes/creep";
import { MovementSystem } from "systems/movement-system";

export class UpgraderCreep extends CreepRunner {

  public override onRun(): void {
    this.runUpgraderCreep();
  }

  private runUpgraderCreep(): void {
    const creep = this.creep;
    if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.working = false;
        delete creep.memory.targetId;
        delete creep.memory.movementSystem?.path;
        creep.say("u: harvesting");
    }
    if (!creep.memory.working && creep.store[RESOURCE_ENERGY] === creep.store.getCapacity()) {
        creep.memory.working = true;
        delete creep.memory.targetId;
        delete creep.memory.movementSystem?.path;
        creep.say("upgrading");
    }
    if (creep.memory.working) {
        if (!creep.room.controller) {
            throw new Error(`${creep.id} - No room controller to upgrade: ${creep.room.name}`);
        }

        if (this.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
            MovementSystem.moveToWithReservation(creep, creep.room.controller, creep.memory.workDuration, 3);
        }
    } else {
        // Find energy
        this.getEnergy();
    }
}
}
