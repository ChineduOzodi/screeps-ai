import { CreepRole, CreepRunner } from "prototypes/creep";
import { BuilderCreep } from "creep-roles/builder-creep";
import { DefenderCreep } from "creep-roles/defender-creep";
import { HarvesterCreep } from "creep-roles/harvester-creep";
import { MinerCreep } from "creep-roles/miner-creep";
import { Movement } from "infrastructure/movement";
import { RepairerCreep } from "./../creep-roles/repairer-creep";
import { UpgraderCreep } from "creep-roles/upgrader-creep";

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
        Movement.run(creep);
    }

    public static getCreepRunner(creep: Creep): CreepRunner | undefined {
        switch (creep.memory.role) {
            case CreepRole.HARVESTER:
                return new HarvesterCreep(creep);
            case CreepRole.REPAIRER:
                return new RepairerCreep(creep);
            case CreepRole.UPGRADER:
                return new UpgraderCreep(creep);
            case CreepRole.BUILDER:
                return new BuilderCreep(creep);
            case CreepRole.DEFENDER:
                return new DefenderCreep(creep);
            case CreepRole.MINER:
                return new MinerCreep(creep);
            default:
                console.log(`ERROR: creep (${creep.name}) role "${creep.memory.role}" not setup`);
                return;
        }
    }
}
