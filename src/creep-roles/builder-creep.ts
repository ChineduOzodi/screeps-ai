import { CreepRunner } from "prototypes/creep";
import { BuilderSystem } from "systems/builder-system";

export class BuilderCreep extends CreepRunner {

  public override onRun(): void {
    BuilderSystem.runBuilderCreep(this);
  }
}
