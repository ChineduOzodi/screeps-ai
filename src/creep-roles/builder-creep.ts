import { CreepRunner } from "prototypes/creep";
import { MovementSystem } from "systems/movement-system";

export class BuilderCreep extends CreepRunner {

  public override onRun(): void {
    this.runBuilderCreep();
  }

  public runBuilderCreep(): void {
    const { creep } = this;
    const movementSystem = this.getMovementSystem();
    if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
      creep.memory.working = false;
      delete creep.memory.targetId;
      delete movementSystem.path;
      creep.say("b: harvesting");
    }
    if (!creep.memory.working && creep.store[RESOURCE_ENERGY] === creep.store.getCapacity()) {
      creep.memory.working = true;
      delete creep.memory.targetId;
      delete movementSystem.path;
      creep.say("building");
    }
    if (creep.memory.working) {
      let target: ConstructionSite | null = null;
      if (creep.memory.targetId) {
        target = Game.getObjectById<ConstructionSite>(creep.memory.targetId);
        if (!target) {
          delete creep.memory.targetId;
          delete movementSystem.path;
        }
      } else {
        const colony = this.getColony();
        if (!colony) {
          console.log(`builder-system | creep: ${creep.name}, missing colony`);
        } else {
          const buildQueue = colony.builderManagement?.buildQueue || [];
          if (buildQueue.length === 0) {
            return;
          }

          creep.memory.targetId = buildQueue[0];
          target = Game.getObjectById<ConstructionSite>(creep.memory.targetId);
        }
      }

      if (target) {
        if (this.build(target) === ERR_NOT_IN_RANGE) {
          MovementSystem.moveToWithReservation(creep, target, creep.memory.workDuration, 3);
        }
      }
    } else {
      // Find energy
      this.getEnergy();
    }
  }
}
