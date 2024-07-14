import { CreepRole, CreepSpawner } from "prototypes/creep";
import { BaseSystemImpl } from "./base-system";
import { UpgraderCreepSpawner } from "creep-roles/upgrader-creep";

export class UpgradeSystem extends BaseSystemImpl {
    public override get systemInfo(): ColonyUpgradeManagement {
        if (!this.colony.colonyInfo.upgradeManagement) {
            this.colony.colonyInfo.upgradeManagement = {
                nextUpdate: Game.time,
                energyUsageTracking: {
                    actualEnergyUsagePercentage: 0,
                    estimatedEnergyWorkRate: 0,
                    requestedEnergyUsageWeight: 0.5,
                    allowedEnergyWorkRate: 0,
                },
                creepSpawnersInfo: {},
            };
        }
        return this.colony.colonyInfo.upgradeManagement;
    }

    public override get energyUsageTracking(): EnergyUsageTracking {
        if (!this.systemInfo.energyUsageTracking) {
            this.systemInfo.energyUsageTracking = {
                actualEnergyUsagePercentage: 0,
                estimatedEnergyWorkRate: 0,
                requestedEnergyUsageWeight: 0.5,
                allowedEnergyWorkRate: 0,
            };
        }
        return this.systemInfo.energyUsageTracking;
    }

    public override onStart(): void {}

    public override run(): void {}
    public override onLevelUp(_level: number): void {}

    public override getCreepSpawners(): CreepSpawner[] {
        return [new UpgraderCreepSpawner()];
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.UPGRADER];
    }
}
