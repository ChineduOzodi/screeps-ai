import { CreepExtras } from "prototypes/creep";
import { HarvesterCreep } from "creep-roles/harvester-creep";
import { MovementSystem } from "systems/movement-system";

export class CreepManagement {
    public static run(creep: Creep): void {
        if (creep.spawning) {
            return;
        }

        const creepExtras = this.getCreepExtras(creep);
        const colony = creepExtras.getColony();
        if (colony && colony.creeps && creep.name in colony.creeps) {
            colony.creeps[creep.name].id = creep.id;
        }

        creepExtras.run();
        MovementSystem.run(creep);
    }

    public static getCreepExtras(creep: Creep): CreepExtras {
        switch (creep.memory.role) {
            case "harvester":
                return new HarvesterCreep(creep);
            // case "upgrader":
            //     UpgradeSystem.runUpgraderCreep(this.creep);
            //     break;

            // case "builder":
            //     BuilderSystem.runBuilderCreep(this);
            //     break;

            // case "defender":
            //     DefenceSystem.runDefenderCreep(this);
            //     break;
            default:
                return new CreepExtras(creep);
        }
    }
}
