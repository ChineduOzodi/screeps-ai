import { CreepRunner } from "prototypes/creep";
import { HarvesterCreep } from "creep-roles/harvester-creep";
import { MovementSystem } from "systems/movement-system";
import { RepairerCreep } from "./../creep-roles/repairer-creep";
import { UpgraderCreep } from "creep-roles/upgrader-creep";
import { BuilderCreep } from "creep-roles/builder-creep";
import { DefenderCreep } from "creep-roles/defender-creep";

export class CreepManagement {
    public static run(creep: Creep): void {
        if (creep.spawning) {
            return;
        }

        const creepRunner = this.getCreepRunner(creep);
        if (!creepRunner) {
            return;
        }

        const colony = creepRunner.getColony();
        if (colony && colony.creeps && creep.name in colony.creeps) {
            colony.creeps[creep.name].id = creep.id;
        }

        creepRunner.run();
        MovementSystem.run(creep);
    }

    public static getCreepRunner(creep: Creep): CreepRunner | undefined {
        switch (creep.memory.role) {
            case "harvester":
                return new HarvesterCreep(creep);
            case "repairer":
                return new RepairerCreep(creep);
            case "upgrader":
                return new UpgraderCreep(creep);
            case "builder":
                return new BuilderCreep(creep);
            case "defender":
                return new DefenderCreep(creep);
            default:
                console.log(`ERROR: creep (${creep.name}) role "${creep.memory.role}" not setup`);
                return;
        }
    }
}
