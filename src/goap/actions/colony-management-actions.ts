/* eslint-disable max-classes-per-file */
import { Action, WorldState } from "../types";
import { ColonyManager } from "../../prototypes/colony";

export class DefendRoomAction implements Action {
    public cost = 10;
    public preconditions: WorldState = { isSafe: false };
    public effects: WorldState = { isSafe: true };
    public name = "DefendRoomAction";

    constructor(private colony: ColonyManager) {}

    public getCost(): number {
        return this.cost;
    }

    public isValid(): boolean {
        // Valid if there are actually enemies?
        // Or valid always, and planner only picks it if preconditions match (isSafe: false)
        return true;
    }

    public execute(): boolean {
        this.colony.systems.defense.setEnergyBudgetWeight(2.0);
        // Returns false to keep the action active until the goal is met (isSafe: true)
        // However, GOAP actions usually return 'true' when their *execution step* is done.
        // If we want it to persist, the planner will just re-select it next tick if goal isn't met.
        // Returning true here means "I have done my part this tick (set the flag)".
        return true;
    }
}

export class MaintainStructuresAction implements Action {
    public cost = 20;
    public preconditions: WorldState = { structuresRepaired: false };
    public effects: WorldState = { structuresRepaired: true };
    public name = "MaintainStructuresAction";

    constructor(private colony: ColonyManager) {}

    public getCost(): number {
        return this.cost;
    }

    public isValid(): boolean {
        return true;
    }

    public execute(): boolean {
        this.colony.systems.infrastructure.setEnergyBudgetWeight(0.5);
        return true;
    }
}

export class UpgradeControllerAction implements Action {
    public cost = 30; // Higher cost means we prefer other critical tasks if possible?
    public preconditions: WorldState = {}; // Preconditions depend on specific RCL goals
    public effects: WorldState = {}; // Effects depend on specific RCL goals
    public name = "UpgradeControllerAction";

    // Dynamic effects based on target?
    // For simple "Upgrade to X" goals, we can assume this action contributes to RCL.
    // But the generic class needs static effects for the Planner?
    // The Planner matches keys.
    // If Goal is { rcl: 2 }, and current is { rcl: 1 }.
    // We need an action that effects { rcl: 2 }.
    // We can instantiate this action with a specific target level.

    private targetLevel: number;
    private colony: ColonyManager;

    constructor(colony: ColonyManager, targetLevel: number) {
        this.colony = colony;
        this.targetLevel = targetLevel;
        this.preconditions = { rcl: targetLevel - 1 }; // Simplifying assumption: step by step
        this.effects = { rcl: targetLevel };
        this.name = `UpgradeControllerTo${targetLevel}`;

        // Adjust logic: If we are at RCL 1, upgrading leads to RCL 2.
        // If we want RCL 3, we need RCL 2 first.
    }

    public getCost(): number {
        return this.cost;
    }

    public isValid(): boolean {
        const room = this.colony.getMainRoom();
        return (room.controller?.level || 0) < 8;
    }

    public execute(): boolean {
        this.colony.systems.upgrade.setEnergyBudgetWeight(1.0);
        return true;
    }
}

export class HarvestEnergyAction implements Action {
    public cost = 5; // Low cost, fundamental
    public preconditions: WorldState = { hasEnergy: false };
    public effects: WorldState = { hasEnergy: true };
    public name = "HarvestEnergyAction";

    constructor(private colony: ColonyManager) {}

    public getCost(): number {
        return this.cost;
    }

    public isValid(): boolean {
        return true;
    }

    public execute(): boolean {
        this.colony.systems.energy.setEnergyBudgetWeight(2.0);
        return true;
    }
}
