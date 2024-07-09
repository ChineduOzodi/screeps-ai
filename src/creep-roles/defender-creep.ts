import { CreepRunner } from "prototypes/creep";
import { DefenseSystem } from "systems/defense-system";

export class DefenderCreep extends CreepRunner {

  public override onRun(): void {
    DefenseSystem.runDefenderCreep(this);
  }
}
