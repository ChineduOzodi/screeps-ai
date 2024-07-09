import { CreepRunner } from "prototypes/creep";
import { UpgradeSystem } from "systems/upgrade-system";

export class UpgraderCreep extends CreepRunner {

  public override onRun(): void {
    UpgradeSystem.runUpgraderCreep(this.creep);
  }
}
