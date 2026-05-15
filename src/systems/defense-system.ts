import { BaseSystemImpl } from "./base-system";
import { CreepRole } from "prototypes/types";
import { CreepSpawner } from "prototypes/CreepSpawner";
import { DefenderCreepSpawner } from "creep-roles/defender-creep";
import { HealerCreepSpawner } from "creep-roles/healer-creep";
import { Objective } from "objectives/types";

export class DefenseSystem extends BaseSystemImpl {
    public override get systemInfo(): BaseSystemInfo {
        if (!this.colony.colonyInfo.defenseManagement) {
            this.colony.colonyInfo.defenseManagement = {
                nextUpdate: Game.time,
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

    public constructor(colony: any) {
        super(colony);
    }

    public override run(): void {
        super.run();
        const room = this.colony.getMainRoom();
        const hostiles = room.find(FIND_HOSTILE_CREEPS);
        if (hostiles.length > 0) {
            this.energyUsageTracking.requestedEnergyUsageWeight = 10;
        } else {
            this.energyUsageTracking.requestedEnergyUsageWeight = 0;
        }
    }

    public override getCreepSpawners(): CreepSpawner[] {
        return [new DefenderCreepSpawner(), new HealerCreepSpawner()];
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.DEFENDER, CreepRole.HEALER];
    }

    public override getObjectives(): Objective[] {
        const room = this.colony.getMainRoom();
        const hostiles = room.find(FIND_HOSTILE_CREEPS);

        return [
            {
                name: "Defend Room",
                priority: 1000,
                isReady: () => hostiles.length > 0,
                isComplete: () => hostiles.length === 0,
                execute: () => {
                    this.energyUsageTracking.requestedEnergyUsageWeight = 10;
                },
            },
        ];
    }
}
