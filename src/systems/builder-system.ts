import { BaseSystemImpl } from "./base-system";
import { BuilderCreepSpawner } from "creep-roles/builder-creep";
import { CreepRole } from "prototypes/types";
import { CreepSpawner } from "prototypes/CreepSpawner";
import { BuildTowerAction } from "goap/actions/infrastructure-actions";

export class BuilderSystem extends BaseSystemImpl {
    public override get systemInfo(): ColonyBuilderManagement {
        if (!this.colony.colonyInfo.builderManagement) {
            this.colony.colonyInfo.builderManagement = {
                nextUpdate: Game.time,
                buildQueue: [],
            };
        }
        return this.colony.colonyInfo.builderManagement;
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
        this.updateBuildQueue();
    }
    public override run(): void {
        super.run();
        this.updateBuildQueue();

        const room = this.colony.getMainRoom();
        const rcl = room.controller?.level || 0;

        // 1. Tower Construction
        if (rcl >= 3 && !this.colony.constructionManager.hasPlannedStructures(STRUCTURE_TOWER, 1)) {
            new BuildTowerAction(this.colony).execute();
        }

        // 2. Weight calculation
        if (!this.colony.roadManager.areColonyRoadsBuilt()) {
            this.energyUsageTracking.requestedEnergyUsageWeight = 1.0;
        } else {
            const queue = this.colony.colonyInfo.builderManagement?.buildQueue || [];
            if (queue.length > 0) {
                this.energyUsageTracking.requestedEnergyUsageWeight = 0.5;
            } else {
                this.energyUsageTracking.requestedEnergyUsageWeight = 0;
            }
        }
    }

    public constructor(colony: any) {
        super(colony);
    }

    public override getCreepSpawners(): CreepSpawner[] {
        return [new BuilderCreepSpawner()];
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.BUILDER];
    }

    public override getEnergyDemand(): number {
        const queue = this.systemInfo.buildQueue || [];
        if (queue.length === 0) {
            return 0;
        }
        return this.energyUsageTracking.estimatedEnergyWorkRate;
    }

    public override getStatus(): string | null {
        const room = this.colony.getMainRoom();
        const rcl = room.controller?.level || 0;

        if (rcl >= 3 && !this.colony.constructionManager.hasPlannedStructures(STRUCTURE_TOWER, 1)) {
            return "Building Tower";
        }

        if (!this.colony.roadManager.areColonyRoadsBuilt()) {
            return "Building Roads";
        }

        const queueCount = this.colony.colonyInfo.builderManagement?.buildQueue?.length || 0;
        if (queueCount > 0) {
            return `Constructing ${queueCount} Sites`;
        }

        return null;
    }

    private updateBuildQueue(): void {
        if (!this.colony.colonyInfo.builderManagement) {
            this.colony.colonyInfo.builderManagement = {
                nextUpdate: Game.time,
                buildQueue: [],
            };
        }

        const sites: ConstructionSite[] = [];
        for (const id in Game.constructionSites) {
            const site = Game.constructionSites[id];
            if (site && site.room && this.colony.colonyInfo.rooms[site.room.name]) {
                sites.push(site);
            }
        }
        this.colony.colonyInfo.builderManagement.buildQueue = sites.map(s => s.id);
    }
}
