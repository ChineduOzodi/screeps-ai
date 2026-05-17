import { CreepRole } from "prototypes/types";
import { CreepSpawner } from "prototypes/CreepSpawner";

import { BaseSystemImpl } from "./base-system";
import { RepairerCreepSpawner } from "creep-roles/repairer-creep";
import { RepairUtils } from "utils/repair-utils";

import { Action, Goal, WorldState } from "goap/types";

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

    public override onStart(): void {}

    public constructor(colony: any) {
        super(colony);
    }

    public override run(): void {
        super.run();
        this.checkRepairNeeds();
        this.colony.roadManager.updateRoadStats();
        this.checkRoadPlanning();
    }

    private checkRoadPlanning(): void {
        const info = this.systemInfo;
        const rcl = this.colony.getMainRoom()?.controller?.level || 0;

        if (typeof info.lastRclPlanned === "undefined") {
            info.lastRclPlanned = 0;
        }

        if (typeof info.lastPlannedTick === "undefined") {
            info.lastPlannedTick = 0;
        }

        const timeSinceLastPlan = Game.time - info.lastPlannedTick;

        if (rcl > info.lastRclPlanned || timeSinceLastPlan > 2000) {
            console.log(
                `[Infrastructure] Triggering road planning for colony ${this.colony.colonyInfo.id} (RCL: ${rcl}, Ticks since last: ${timeSinceLastPlan})`,
            );
            this.colony.roadManager.planColonyRoads();
            info.lastRclPlanned = rcl;
            info.lastPlannedTick = Game.time;
        }
    }

    private checkRepairNeeds(): void {
        if (Game.time % 50 !== 0) {
            return;
        }

        const stats = this.colony.constructionManager.getRepairStats();
        const rcl = this.room?.controller?.level || 0;
        const storageTarget = RepairUtils.getStorageTarget(rcl);
        const currentStorage = this.colony.getPrimaryStorage()?.store[RESOURCE_ENERGY] || 0;

        let weight = 0;

        if (stats.totalNeeded > 0) {
            // Maintenance budget (Base)
            weight = 0.1;

            // Emergency budget (Prioritize over maintenance if something is critical)
            if (stats.emergencyHits > 0) {
                weight = 0.2;
            }

            // Fortification budget (Bonus)
            if (stats.fortificationHits > 0 && currentStorage > storageTarget) {
                weight += 0.15;
            }
        }

        this.energyUsageTracking.requestedEnergyUsageWeight = weight;
    }

    public override getEnergyDemand(): number {
        const stats = this.colony.constructionManager.getRepairStats();
        if (stats.totalNeeded > 0) {
            return 999;
        }
        return 0;
    }

    public override getStatus(): string | null {
        const stats = this.colony.constructionManager.getRepairStats();
        if (stats.emergencyHits > 0) {
            return "Emergency Repairs";
        }
        if (stats.totalNeeded > 0) {
            return "Maintaining Infrastructure";
        }
        return null;
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.REPAIRER];
    }

    public override getCreepSpawners(): CreepSpawner[] {
        return [new RepairerCreepSpawner()];
    }
}
