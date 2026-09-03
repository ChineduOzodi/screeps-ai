import { CreepRole } from "prototypes/types";
import { CreepRunner } from "prototypes/creep";
import { ColonyRegistry } from "prototypes/colony-registry";
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
import { MineralMinerCreep } from "creep-roles/mineral-miner-creep";
import { ClaimerCreep } from "creep-roles/claimer-creep";
import { PioneerCreep } from "creep-roles/pioneer-creep";
import { RangedDefenderCreep } from "creep-roles/ranged-defender-creep";
import { LabHaulerCreep } from "creep-roles/lab-hauler-creep";
import { Logger } from "utils/logger";

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

        const colony = ColonyRegistry.get(colonyId);
        if (colony) {
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
            case CreepRole.MINERAL_MINER:
                return new MineralMinerCreep(creep);
            case CreepRole.CLAIMER:
                return new ClaimerCreep(creep);
            case CreepRole.PIONEER:
                return new PioneerCreep(creep);
            case CreepRole.RANGED_DEFENDER:
                return new RangedDefenderCreep(creep);
            case CreepRole.LAB_HAULER:
                return new LabHaulerCreep(creep);
            default:
                Logger.error(`creep (${creep.name}) role "${creep.memory.role}" not setup`);
                return;
        }
    }
}
