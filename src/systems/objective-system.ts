import { BaseSystemImpl } from "./base-system";
import { ColonyManager } from "prototypes/types";
import { Objective } from "../objectives/types";

export class ObjectiveSystem extends BaseSystemImpl {
    private currentObjective: Objective | null = null;

    constructor(colony: ColonyManager) {
        super(colony);
    }

    public override get systemInfo(): any {
        if (!(this.colony.colonyInfo as any).objectiveManagement) {
            (this.colony.colonyInfo as any).objectiveManagement = {};
        }
        return (this.colony.colonyInfo as any).objectiveManagement;
    }

    public override get energyUsageTracking() {
        return {
            desiredAmount: 0,
            estimatedEnergyWorkRate: 0,
            requestedEnergyUsageWeight: 0,
            allowedEnergyWorkRate: 0,
            actualEnergyUsagePercentage: 0,
        };
    }

    public override onStart(): void {
        console.log("Objective System Started");
    }

    public override run(): void {
        const objectives = this.getAllObjectives();

        // 1. Check if current objective is still valid
        if (this.currentObjective) {
            if (this.currentObjective.isComplete() || !this.currentObjective.isReady()) {
                console.log(
                    `Objective ${this.currentObjective.name} ${this.currentObjective.isComplete() ? "complete" : "no longer ready"}.`,
                );
                this.currentObjective = null;
            }
        }

        // 2. Find the best objective
        const availableObjectives = objectives.filter(o => o.isReady() && !o.isComplete());
        const bestObjective = availableObjectives.sort((a, b) => b.priority - a.priority)[0];

        // 3. Switch if a higher priority objective is available, or if we have none
        if (bestObjective) {
            if (!this.currentObjective || bestObjective.priority > this.currentObjective.priority) {
                if (this.currentObjective && bestObjective.name !== this.currentObjective.name) {
                    console.log(`Switching objective from ${this.currentObjective.name} to ${bestObjective.name}`);
                }
                this.currentObjective = bestObjective;
            }
        }

        // 4. Execute
        if (this.currentObjective) {
            this.currentObjective.execute();
        }
    }

    private getAllObjectives(): Objective[] {
        const systems = this.colony.getSystemsList();
        let allObjectives: Objective[] = [];

        for (const system of systems) {
            allObjectives = allObjectives.concat(system.getObjectives());
        }
        return allObjectives;
    }

    public get activeObjective(): Objective | null {
        return this.currentObjective;
    }

    public override getRolesToTrackEnergy(): any[] {
        return [];
    }

    public override getCreepSpawners(): any[] {
        return [];
    }
}
