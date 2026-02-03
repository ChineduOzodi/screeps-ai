import { BaseSystemImpl } from "./base-system";
import { BuilderCreepSpawner } from "creep-roles/builder-creep";
import { CreepRole } from "prototypes/creep";
import { CreepSpawner } from "prototypes/CreepSpawner";
import {
    BuildContainerAction,
    BuildExtensionsAction,
    BuildRoadsAction,
    BuildTowerAction,
} from "goap/actions/infrastructure-actions";
import { Action, Goal, WorldState } from "goap/types";

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
    }

    public constructor(colony: any) {
        super(colony);
        this.defaultEnergyWeight = 0.5;
    }

    public override getCreepSpawners(): CreepSpawner[] {
        return [new BuilderCreepSpawner()];
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.BUILDER];
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

    // --- GOAP Integration ---

    public override getGoapGoals(state: WorldState): Goal[] {
        const goals: Goal[] = [
            {
                name: "Build Extensions to 5",
                priority: this.getNumber(state, "rcl") >= 2 && this.getNumber(state, "extensions") < 5 ? 100 : 0,
                desiredState: { extensions: 5 },
            },
            {
                name: "Build Extensions to 10",
                priority: this.getNumber(state, "rcl") >= 3 && this.getNumber(state, "extensions") < 10 ? 100 : 0,
                desiredState: { extensions: 10 },
            },
            {
                name: "Build First Container",
                priority: this.getNumber(state, "rcl") >= 1 && !state.hasContainer ? 50 : 0,
                desiredState: { hasContainer: true },
            },
            {
                name: "Build Roads",
                priority: this.getNumber(state, "rcl") >= 1 && !state.hasRoads ? 40 : 0,
                desiredState: { hasRoads: true },
            },
            {
                name: "Build Tower",
                priority: this.getNumber(state, "rcl") >= 3 && !state.hasTower ? 80 : 0,
                desiredState: { hasTower: true },
            },
        ];
        return goals;
    }

    public override getGoapActions(): Action[] {
        return [
            new BuildExtensionsAction(this.colony, 5),
            new BuildExtensionsAction(this.colony, 10),
            new BuildRoadsAction(this.colony),
            new BuildContainerAction(this.colony),
            new BuildTowerAction(this.colony),
        ];
    }

    private getNumber(state: WorldState, key: string): number {
        const val = state[key];
        return typeof val === "number" ? val : 0;
    }
}
