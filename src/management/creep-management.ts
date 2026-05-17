import { CreepRole } from "prototypes/types";
import { CreepRunner } from "prototypes/creep";
import { ColonyManagerImpl } from "prototypes/colony";
import { BuilderCreep } from "creep-roles/builder-creep";
import { DefenderCreep } from "creep-roles/defender-creep";
import { HealerCreep } from "creep-roles/healer-creep";
import { HarvesterCreep } from "creep-roles/harvester-creep";
import { MinerCreep } from "creep-roles/miner-creep";
import { Movement } from "infrastructure/movement";
import { CarrierCreep } from "creep-roles/carrier-creep";
import { ExtensionFillerCreep } from "creep-roles/extension-filler-creep";
import { RepairerCreep } from "./../creep-roles/repairer-creep";
import { UpgraderCreep } from "creep-roles/upgrader-creep";
import { ScoutCreep } from "creep-roles/scout-creep";
import { ReserverCreep } from "creep-roles/reserver-creep";

export class CreepManagement {
    public static run(creep: Creep): void {
        if (creep.spawning) {
            return;
        }

        const creepRunner = this.getCreepRunner(creep);
        if (!creepRunner) {
            return;
        }

        let colonyId = creep.memory.colonyId;
        if (!Memory.colonies[colonyId]) {
            creep.memory.colonyId = creep.room.name;
            colonyId = creep.room.name;
        }

        const colonyData = Memory.colonies[colonyId];
        if (colonyData) {
            const colony = new ColonyManagerImpl(colonyData);
            creepRunner.setColony(colony);

            const colonyCreepData = colony.getCreepData(creep.name);
            if (colonyCreepData) {
                colonyCreepData.id = creep.id;
            }
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
            case CreepRole.HEALER:
                return new HealerCreep(creep);
            case CreepRole.MINER:
                return new MinerCreep(creep);
            case CreepRole.CARRIER:
                return new CarrierCreep(creep);
            case CreepRole.EXTENSION_FILLER:
                return new ExtensionFillerCreep(creep);
            case CreepRole.SCOUT:
                return new ScoutCreep(creep);
            case CreepRole.RESERVER:
                return new ReserverCreep(creep);
            default:
                console.log(`ERROR: creep (${creep.name}) role "${creep.memory.role}" not setup`);
                return;
        }
    }
}
