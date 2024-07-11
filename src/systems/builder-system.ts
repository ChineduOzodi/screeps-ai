import { ColonyManager } from "prototypes/colony";
import { SpawningSystem } from "./spawning-system";
import { BaseSystemImpl } from "./base-system";

export class BuilderSystem extends BaseSystemImpl {

    public override get systemInfo(): ColonyBuilderManagement {
        if (!this.colony.colonyInfo.builderManagement) {
            this.colony.colonyInfo.builderManagement = {
                nextUpdate: Game.time,
                buildQueue: [],
                energyUsageTracking: {
                    actualEnergyUsagePercentage: 0,
                    estimatedEnergyWorkRate: 0,
                    requestedEnergyUsageWeight: 0,
                    allowedEnergyWorkRate: 0
                }
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
                allowedEnergyWorkRate: 0
            };
        }
        return this.systemInfo.energyUsageTracking;
    }

    public override onStart(): void {
        this.systemInfo;
    }
    public override run(): void {
        this.manageBuilders();
    }
    public override onLevelUp(_level: number): void {}
    public override updateProfiles(): void {
        // TODO: Add ability to scale builder.
    }

    public manageBuilders(): void {
        const colonyManager = this.colony;
        if (!this.systemInfo.builders) {
            this.systemInfo.builders = this.createBuilderProfile(colonyManager);
        }
        this.systemInfo.buildQueue = this.getConstructionSites(colonyManager.colonyInfo).map(
            x => x.id
        );
        const { buildQueue, builders } = this.systemInfo;
        if (buildQueue.length > 0) {
            this.energyUsageTracking.requestedEnergyUsageWeight = 0.5;
            const energyUsagePerCreep = -colonyManager.getTotalEstimatedEnergyFlowRate("builder");

            if (energyUsagePerCreep <= 0) {
                builders.desiredAmount = 1;
            } else {
                builders.desiredAmount = Math.max(1, Math.floor(this.energyUsageTracking.allowedEnergyWorkRate / energyUsagePerCreep));
            }
        } else {
            this.energyUsageTracking.requestedEnergyUsageWeight = 0;
            builders.desiredAmount = 0;
        }

        SpawningSystem.run(colonyManager, this.systemInfo.builders);
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

    public createBuilderProfile(colony: ColonyManager): ColonyCreepSpawnManagement {
        const body: BodyPartConstant[] = [];

        body.push(WORK);
        body.push(CARRY);
        body.push(CARRY);
        body.push(MOVE);
        body.push(MOVE);

        const energyUsePerTick = BUILD_POWER * 1;

        const memory: AddCreepToQueueOptions = {
            workTargetId: colony.getMainRoom().controller?.id,
            workDuration: (CARRY_CAPACITY * 2) / energyUsePerTick,
            role: "builder",
            averageEnergyConsumptionProductionPerTick: energyUsePerTick
        };
        const creepSpawnManagement: ColonyCreepSpawnManagement = {
            creepNames: [],
            desiredAmount: 0,
            bodyBlueprint: body,
            memoryBlueprint: memory
        };

        return creepSpawnManagement;
    }

    public override getRolesToTrackEnergy(): string[] {
        return ["builder"];
    }
}
