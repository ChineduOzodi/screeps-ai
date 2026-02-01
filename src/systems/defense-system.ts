import { BaseSystemImpl } from "./base-system";
import { CreepRole } from "prototypes/creep";
import { CreepSpawner } from "prototypes/CreepSpawner";
import { DefenderCreepSpawner } from "creep-roles/defender-creep";

import { Action, Goal, WorldState } from "goap/types";
import { DefendRoomAction } from "goap/actions/colony-management-actions";

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

    public override onStart(): void {
        this.defaultEnergyWeight = 0;
    }

    public override run(): void {
        super.run();
    }

    public override onLevelUp(_level: number): void {}

    public override getCreepSpawners(): CreepSpawner[] {
        return [new DefenderCreepSpawner()];
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.DEFENDER];
    }

    public override getGoapGoals(state: WorldState): Goal[] {
        const goals: Goal[] = [{
            name: "Defend Room",
            priority: !state['isSafe'] ? 1000 : 0,
            desiredState: { isSafe: true }
        }];
        return goals;
    }

    public override getGoapActions(): Action[] {
        return [new DefendRoomAction(this.colony)];
    }
}
