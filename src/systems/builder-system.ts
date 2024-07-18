import { BaseSystemImpl } from "./base-system";
import { BuilderCreepSpawner } from "creep-roles/builder-creep";
import { CreepRole } from "prototypes/creep";
import { CreepSpawner } from "prototypes/CreepSpawner";

export class BuilderSystem extends BaseSystemImpl {
    public override get systemInfo(): ColonyBuilderManagement {
        if (!this.colony.colonyInfo.builderManagement) {
            this.colony.colonyInfo.builderManagement = {
                nextUpdate: Game.time,
                buildQueue: [],
                creepSpawnersInfo: {},
            };
        }
        return this.colony.colonyInfo.builderManagement;
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

    public override onStart(): void {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        this.systemInfo;
    }
    public override run(): void {
        this.manageBuilders();
    }
    public override onLevelUp(_level: number): void {}

    public override getCreepSpawners(): CreepSpawner[] {
        return [new BuilderCreepSpawner()];
    }

    public manageBuilders(): void {
        const colonyManager = this.colony;

        this.systemInfo.buildQueue = this.getConstructionSites(colonyManager.colonyInfo).map(x => x.id);
        const { buildQueue } = this.systemInfo;
        if (buildQueue.length > 0) {
            this.energyUsageTracking.requestedEnergyUsageWeight = 0.5;
        } else {
            this.energyUsageTracking.requestedEnergyUsageWeight = 0;
        }
    }

    public getConstructionSites(colony: Colony): ConstructionSite<BuildableStructureConstant>[] {
        const constructionSites: ConstructionSite<BuildableStructureConstant>[] = [];
        for (const name in Game.constructionSites) {
            const site = Game.constructionSites[name];

            if (colony.rooms.find(x => site.room?.name === x.name)) {
                constructionSites.push(site);
            }
        }

        return constructionSites;
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.BUILDER];
    }
}
