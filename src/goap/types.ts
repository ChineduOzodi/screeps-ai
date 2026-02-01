
export interface WorldState {
    [key: string]: boolean | number;
}

export interface Goal {
    name: string;
    priority: number;
    desiredState: WorldState;
    validate?: () => boolean; // Optional: check if goal is still valid
}

export interface Action {
    name: string;
    cost: number;
    preconditions: WorldState;
    effects: WorldState;

    /**
     * Estimated cost to complete the action.
     */
    getCost(): number;

    /**
     * Check if the action can be performed (beyond state preconditions).
     */
    isValid(): boolean;

    /**
     * Execute the action. Returns true if completed, false if still in progress.
     */
    execute(): boolean;
}
