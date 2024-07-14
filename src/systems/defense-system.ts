import { CreepRole, CreepSpawner } from "prototypes/creep";

import { BaseSystemImpl } from "./base-system";
import { DefenderCreepSpawner } from "creep-roles/defender-creep";

export class DefenseSystem extends BaseSystemImpl {
    public override get systemInfo(): ColonyBaseSystemInfo {
        if (!this.colony.colonyInfo.defenseManagement) {
            this.colony.colonyInfo.defenseManagement = {
                nextUpdate: Game.time,
                creepSpawnersInfo: {},
            };
        }
        return this.colony.colonyInfo.defenseManagement;
    }

    public override get energyUsageTracking(): EnergyUsageTracking {
        if (!this.systemInfo.energyUsageTracking) {
            this.systemInfo.energyUsageTracking = {
                actualEnergyUsagePercentage: 0,
                estimatedEnergyWorkRate: 0,
                requestedEnergyUsageWeight: 0,
                allowedEnergyWorkRate: 0,
            };
        }
        return this.systemInfo.energyUsageTracking;
    }

    public override onStart(): void {}

    public override run(): void {}

    public override onLevelUp(_level: number): void {}

    public override getCreepSpawners(): CreepSpawner[] {
        return [new DefenderCreepSpawner()];
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.DEFENDER];
    }
}
