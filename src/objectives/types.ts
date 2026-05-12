export interface Objective {
    name: string;
    priority: number;

    /**
     * Whether the objective is ready to be executed.
     * Use this to check for preconditions like RCL level or available resources.
     */
    isReady(): boolean;

    /**
     * Whether the objective is complete.
     * Once complete, the Objective Manager will move to the next highest priority objective.
     */
    isComplete(): boolean;

    /**
     * Executes the objective's logic for the current tick.
     * Typically sets system energy weights or triggers construction planning.
     */
    execute(): void;
}
