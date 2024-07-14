import { CreepRole, CreepSpawner } from "prototypes/creep";

import { BaseSystemImpl } from "./base-system";
import { RepairerCreepSpawner } from "creep-roles/repairer-creep";

export class InfrastructureSystem extends BaseSystemImpl {
    public override get systemInfo(): ColonyInfrastructureManagement {
        if (!this.colony.colonyInfo.infrastructureManagement) {
            this.colony.colonyInfo.infrastructureManagement = {
                nextUpdate: 0,
                creepSpawnersInfo: {},
            };
        }
        return this.colony.colonyInfo.infrastructureManagement;
    }

    public override get energyUsageTracking(): EnergyUsageTracking {
        if (!this.systemInfo.energyUsageTracking) {
            this.systemInfo.energyUsageTracking = {
                actualEnergyUsagePercentage: 0,
                estimatedEnergyWorkRate: 0,
                requestedEnergyUsageWeight: 0.25,
                allowedEnergyWorkRate: 0,
            };
        }
        return this.systemInfo.energyUsageTracking;
    }

    public override onStart(): void {}

    public override run(): void {}

    public override onLevelUp(_level: number): void {}

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.REPAIRER];
    }

    public override getCreepSpawners(): CreepSpawner[] {
        return [new RepairerCreepSpawner()];
    }
}
