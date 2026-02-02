import { CreepRole } from "prototypes/creep";
import { CreepSpawner } from "prototypes/CreepSpawner";
import { BaseSystemImpl } from "./base-system";
import { UpgraderCreepSpawner } from "creep-roles/upgrader-creep";

import { Action, Goal, WorldState } from "goap/types";
import { UpgradeControllerAction } from "goap/actions/colony-management-actions";

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

    public override onStart(): void {
    }

    public constructor(colony: any) {
        super(colony);
        this.defaultEnergyWeight = 0.5;
    }

    public override run(): void {
        super.run();
    }

    public override getCreepSpawners(): CreepSpawner[] {
        return [new UpgraderCreepSpawner()];
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.UPGRADER];
    }

    public override getGoapGoals(state: WorldState): Goal[] {
        const rcl = (state['rcl'] as number);
        if (rcl >= 8) return [];

        // Always aim for next level.
        const goals: Goal[] = [{
            name: `Upgrade Controller to ${rcl + 1}`,
            priority: 20, // Lower than defense/harvest/maintenance usually
            desiredState: { rcl: rcl + 1 }
        }];
        return goals;
    }

    public override getGoapActions(): Action[] {
        // We supply upgrading actions for current level + 1
        const room = this.room;
        if (!room || !room.controller) return [];
        const level = room.controller.level;
        if (level >= 8) return [];

        return [new UpgradeControllerAction(this.colony, level + 1)];
    }
}
