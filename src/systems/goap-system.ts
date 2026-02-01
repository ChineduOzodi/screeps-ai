import { BaseSystemImpl } from "./base-system";
import { ColonyManager } from "../prototypes/colony";
import { CreepRole } from "../prototypes/creep";
import { Action, Goal, WorldState } from "../goap/types";
import { Planner } from "../goap/planner";
import { CreepSpawner } from "../prototypes/CreepSpawner";

export class GoapSystem extends BaseSystemImpl {
    private planner: Planner;
    private currentPlan: Action[] = [];
    private currentGoal: Goal | null = null;
    private lastPlanAttempt: number = 0;

    constructor(colony: ColonyManager) {
        super(colony);
        this.planner = new Planner();
    }

    public get activeGoal(): Goal | null {
        return this.currentGoal;
    }

    public get activePlan(): Action[] {
        return this.currentPlan;
    }

    public override get systemInfo(): ColonyGoapManagement {
        if (!this.colony.colonyInfo.goapManagement) {
            this.colony.colonyInfo.goapManagement = {
                nextUpdate: 0,
            };
        }
        return this.colony.colonyInfo.goapManagement;
    }

    public override get energyUsageTracking() {
        return {
             desiredAmount: 0,
             estimatedEnergyWorkRate: 0,
             requestedEnergyUsageWeight: 0, // Request energy based on current action?
             allowedEnergyWorkRate: 0,
             actualEnergyUsagePercentage: 0
        };
    }

    public override onStart(): void {
        console.log("GOAP System Started");
    }

    public override run(): void {
        const state = this.getWorldState();
        this.loadState(state);

        // 1. Check if current goal is still valid/needed
        if (this.currentGoal) {
            if (this.isGoalSatisfied(this.currentGoal, state)) {
                console.log(`Goal ${this.currentGoal.name} satisfied!`);
                this.clearState();
            }
        }

        // 2. If no goal or plan, find a new one
        if (!this.currentGoal || this.currentPlan.length === 0) {
            const bestGoal = this.findBestGoal(state);
            // Replan if we have a better goal, or if we have no coal, or if we failed to plan recently and enough time passed
            // Also if the best goal is different than current stored goal (which we just cleared if it was satisfied, or maybe we just loaded it)
            // Actually, if we loaded a goal, currentGoal is set.
            // We should switch if a HIGHER priority goal is available.

            const currentPriority = this.currentGoal ? this.currentGoal.priority : -1;
            const newPriority = bestGoal ? bestGoal.priority : -1;

            if (bestGoal && (newPriority > currentPriority || !this.currentGoal || (bestGoal.name === this.currentGoal.name && this.currentPlan.length === 0))) {
                 // But wait, if we have a current plan, we might not want to switch unless priority is significantly higher?
                 // For now, strict priority.
                 if (!this.currentGoal || bestGoal.name !== this.currentGoal.name || Game.time - this.lastPlanAttempt > 10) {
                    this.lastPlanAttempt = Game.time;
                    const actions = this.getAvailableActions();
                    const plan = this.planner.plan(state, bestGoal, actions);

                    if (plan) {
                         console.log(`New plan for ${bestGoal.name}: ${plan.map(a => a.name).join(' -> ')}`);
                         this.currentGoal = bestGoal;
                         this.currentPlan = plan;
                         this.saveState();
                    } else {
                         // Log only occasionally
                         if (Game.time % 50 === 0) {
                            console.log(`Could not find plan for ${bestGoal.name}`);
                         }
                    }
                 }
            }
        }

        // 3. Execute current action
        if (this.currentPlan.length > 0) {
            const action = this.currentPlan[0];
            if (action.isValid() && this.arePreconditionsMet(state, action.preconditions)) { // Re-check preconditions
                console.log(`Executing action: ${action.name}`);
                const complete = action.execute();
                if (complete) {
                     this.currentPlan.shift(); // Remove completed action
                     this.saveState();
                }
            } else {
                 console.log(`Action ${action.name} invalid or preconditions not met. Re-planning.`);
                 this.clearState();
            }
        }
    }

    private loadState(state: WorldState): void {
        const info = this.systemInfo;
        if (info.activeGoalName && !this.currentGoal) {
            const goals = this.getAllGoals(state);
            this.currentGoal = goals.find(g => g.name === info.activeGoalName) || null;

            if (this.currentGoal && info.planActionNames && info.planActionNames.length > 0) {
                const availableActions = this.getAvailableActions();
                this.currentPlan = [];
                for (const name of info.planActionNames) {
                    const action = availableActions.find(a => a.name === name);
                    if (action) {
                        this.currentPlan.push(action);
                    } else {
                        console.log(`Could not restore action ${name} from memory. Clearing state.`);
                        this.clearState();
                        return;
                    }
                }
            } else if (this.currentGoal) {
                // Goal explicitly set but no plan? Allow replanning.
                // Or maybe we should keep the goal and let replanner find plan for it.
            }
        }
    }

    private saveState(): void {
        this.systemInfo.activeGoalName = this.currentGoal?.name;
        this.systemInfo.planActionNames = this.currentPlan.map(a => a.name);
    }

    private clearState(): void {
        this.currentGoal = null;
        this.currentPlan = [];
        delete this.systemInfo.activeGoalName;
        delete this.systemInfo.planActionNames;
    }

    private updateBuildQueue(): void {
        // Disabled: Managed by BuilderSystem
    }

    private getWorldState(): WorldState {
        const room = this.colony.getMainRoom();
        const controller = room.controller;
        const spawns = this.colony.getMainSpawn() ? 1 : 0;
        const extensions = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_EXTENSION } }).length;
        const constructionSites = room.find(FIND_CONSTRUCTION_SITES).length;
        const enemies = room.find(FIND_HOSTILE_CREEPS).length;
        const damage = room.find(FIND_STRUCTURES, { filter: s => s.hits < s.hitsMax }).length;

        // Check for specific infrastructure
        const containers = room.find(FIND_STRUCTURES, { filter: { structureType: STRUCTURE_CONTAINER } }).length;
        const towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } }).length;
        // Approximation for roads: do we have *some* roads?
        const roads = room.find(FIND_STRUCTURES, { filter: { structureType: STRUCTURE_ROAD } }).length;

        // Energy check: Do we have enough energy to operate?
        // Use colony.systems.energy.noEnergyCollectors() for a more robust check?
        // Or simple available energy in room?
        const energyAvailable = room.energyAvailable;
        const energyCapacity = room.energyCapacityAvailable;
        const hasEnergy = energyAvailable > 100 || (energyCapacity > 0 && energyAvailable / energyCapacity > 0.1);

        return {
            hasSpawn: spawns > 0,
            rcl: controller?.level || 0,
            extensions: extensions,
            hasConstructionSites: constructionSites > 0,
            isSafe: enemies === 0,
            hasContainer: containers > 0,
            hasTower: towers > 0,
            hasRoads: roads > 5, // Arbitrary threshold to say "we have roads"
            structuresRepaired: damage === 0,
            hasEnergy: hasEnergy,
        };
    }

    private getAllGoals(state: WorldState): Goal[] {
        const systems = this.colony.getSystemsList();
        let allGoals: Goal[] = [];

        for (const system of systems) {
            if (system.getGoapGoals) {
                allGoals = allGoals.concat(system.getGoapGoals(state));
            }
        }
        return allGoals;
    }

    private findBestGoal(state: WorldState): Goal | null {
        return this.getAllGoals(state).sort((a, b) => b.priority - a.priority)[0];
    }

    private getAvailableActions(): Action[] {
        const systems = this.colony.getSystemsList();
        let allActions: Action[] = [];

        for (const system of systems) {
            if (system.getGoapActions) {
                allActions = allActions.concat(system.getGoapActions());
            }
        }
        return allActions;
    }

    // Helper to check if goal is met (using exact value matching for now, consistent with Planner)
    private isGoalSatisfied(goal: Goal, state: WorldState): boolean {
        for (const key in goal.desiredState) {
            // Special handling for >= logic if needed, but for now exact match or boolean true
            if (typeof goal.desiredState[key] === 'boolean') {
                if (state[key] !== goal.desiredState[key]) return false;
            } else if (typeof goal.desiredState[key] === 'number') {
                if ((state[key] as number) < (goal.desiredState[key] as number)) return false;
            }
        }
        return true;
    }

    // Helper for preconditions
    private arePreconditionsMet(state: WorldState, preconditions: WorldState): boolean {
         for (const key in preconditions) {
            if (typeof preconditions[key] === 'number') {
                 if ((state[key] as number) < (preconditions[key] as number)) return false;
            } else {
                if (state[key] !== preconditions[key]) return false;
            }
        }
        return true;
    }

    public override onLevelUp(level: number): void {
        // Not used.
    }
    public override updateProfiles(): void {}
    public override getRolesToTrackEnergy(): any[] { return []; }
    public override getCreepSpawners(): CreepSpawner[] {
        return [];
    }
}
