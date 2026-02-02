import { CreepRole } from "prototypes/creep";
import { CreepSpawner } from "prototypes/CreepSpawner";

import { BaseSystemImpl } from "./base-system";
import { RepairerCreepSpawner } from "creep-roles/repairer-creep";

import { Action, Goal, WorldState } from "goap/types";
import { MaintainStructuresAction } from "goap/actions/colony-management-actions";

export class InfrastructureSystem extends BaseSystemImpl {
    public override get systemInfo(): ColonyInfrastructureManagement {
        if (!this.colony.colonyInfo.infrastructureManagement) {
            this.colony.colonyInfo.infrastructureManagement = {
                nextUpdate: 0,
            };
        }
        return this.colony.colonyInfo.infrastructureManagement;
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
    }

    public constructor(colony: any) {
        super(colony);
        this.defaultEnergyWeight = 0.5;
    }

    public override run(): void {
        super.run();
        this.checkRepairNeeds();
    }

    private checkRepairNeeds(): void {
        if (Game.time % 50 !== 0) {
            return;
        }

        const room = this.colony.getMainRoom();
        if (!room) {
            return;
        }

        const targets = room.find(FIND_STRUCTURES, {
            filter: object => object.hits < object.hitsMax,
        });

        if (targets.length > 0) {
            this.energyUsageTracking.requestedEnergyUsageWeight = 0.25;
        } else {
            this.energyUsageTracking.requestedEnergyUsageWeight = 0;
        }
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.REPAIRER];
    }

    public override getCreepSpawners(): CreepSpawner[] {
        return [new RepairerCreepSpawner()];
    }

    public override getGoapGoals(state: WorldState): Goal[] {
        const goals: Goal[] = [{
            name: "Maintain Structures",
            priority: state['structuresRepaired'] === false ? 50 : 0,
            desiredState: { structuresRepaired: true }
        }];
        return goals;
    }

    public override getGoapActions(): Action[] {
        return [new MaintainStructuresAction(this.colony)];
    }
}
