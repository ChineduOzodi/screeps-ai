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
        return [new DefenderCreepSpawner()];
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.DEFENDER];
    }

    public override getGoapGoals(state: WorldState): Goal[] {
        const goals: Goal[] = [
            {
                name: "Defend Room",
                priority: !state.isSafe ? 1000 : 0,
                desiredState: { isSafe: true },
            },
        ];
        return goals;
    }

    public override getGoapActions(): Action[] {
        return [new DefendRoomAction(this.colony)];
    }
}
