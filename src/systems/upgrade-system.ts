import { CreepRole } from "prototypes/types";
import { CreepSpawner } from "prototypes/CreepSpawner";
import { BaseSystemImpl } from "./base-system";
import { UpgraderCreepSpawner } from "creep-roles/upgrader-creep";
import { Objective } from "objectives/types";

export class UpgradeSystem extends BaseSystemImpl {
    public override get systemInfo(): ColonyUpgradeManagement {
        if (!this.colony.colonyInfo.upgradeManagement) {
            this.colony.colonyInfo.upgradeManagement = {
                nextUpdate: Game.time,
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

    public constructor(colony: any) {
        super(colony);
    }

    public override run(): void {
        super.run();
        this.energyUsageTracking.requestedEnergyUsageWeight = 0.5;
    }

    public override getCreepSpawners(): CreepSpawner[] {
        return [new UpgraderCreepSpawner()];
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.UPGRADER];
    }

    public override getObjectives(): Objective[] {
        const room = this.room;
        if (!room || !room.controller) return [];
        const level = room.controller.level;
        if (level >= 8) return [];

        return [
            {
                name: `Upgrade Controller to ${level + 1}`,
                priority: 20,
                isReady: () => true,
                isComplete: () => (this.room.controller?.level || 0) > level,
                execute: () => {
                    this.energyUsageTracking.requestedEnergyUsageWeight = 1.0;
                },
            },
        ];
    }
}
