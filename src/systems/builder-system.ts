import { BaseSystemImpl } from "./base-system";
import { BuilderCreepSpawner } from "creep-roles/builder-creep";
import { CreepRole } from "prototypes/types";
import { CreepSpawner } from "prototypes/CreepSpawner";
import {
    BuildContainerAction,
    BuildExtensionsAction,
    BuildRoadsAction,
    BuildTowerAction,
} from "goap/actions/infrastructure-actions";
import { Objective } from "objectives/types";

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

        const queue = this.colony.colonyInfo.builderManagement?.buildQueue || [];
        if (queue.length > 0) {
            this.energyUsageTracking.requestedEnergyUsageWeight = 0.5;
        } else {
            this.energyUsageTracking.requestedEnergyUsageWeight = 0;
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

    public override getObjectives(): Objective[] {
        const room = this.colony.getMainRoom();
        if (!room) return [];
        const rcl = room.controller?.level || 0;

        const objectives: Objective[] = [];

        // Build Extensions 5
        objectives.push({
            name: "Build Extensions to 5",
            priority: 100,
            isReady: () => rcl >= 2,
            isComplete: () => this.colony.constructionManager.isProjectComplete("Extensions_Target_5"),
            execute: () => {
                new BuildExtensionsAction(this.colony, 5).execute();
            },
        });

        // Build Extensions 10
        objectives.push({
            name: "Build Extensions to 10",
            priority: 100,
            isReady: () => rcl >= 3,
            isComplete: () => this.colony.constructionManager.isProjectComplete("Extensions_Target_10"),
            execute: () => {
                new BuildExtensionsAction(this.colony, 10).execute();
            },
        });

        // First Container
        objectives.push({
            name: "Build First Container",
            priority: 50,
            isReady: () => rcl >= 1,
            isComplete: () => this.colony.constructionManager.isProjectComplete("First_Container"),
            execute: () => {
                new BuildContainerAction(this.colony).execute();
            },
        });

        // Roads
        objectives.push({
            name: "Build Roads",
            priority: 40,
            isReady: () => rcl >= 1,
            isComplete: () => this.colony.roadManager.areColonyRoadsBuilt(),
            execute: () => {
                new BuildRoadsAction(this.colony).execute();
            },
        });

        // Tower
        objectives.push({
            name: "Build Tower",
            priority: 80,
            isReady: () => rcl >= 3,
            isComplete: () => this.colony.constructionManager.isProjectComplete("First_Tower"),
            execute: () => {
                new BuildTowerAction(this.colony).execute();
            },
        });

        return objectives;
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
            if (site && this.colony.colonyInfo.rooms.some(r => r.name === site.room?.name)) {
                sites.push(site);
            }
        }
        this.colony.colonyInfo.builderManagement.buildQueue = sites.map(s => s.id);
    }
}
