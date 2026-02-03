import { Action, Goal, WorldState } from "./types";

interface Node {
    action: Action | null;
    parent: Node | null;
    state: WorldState;
    g: number; // Cost so far
    h: number; // Heuristic (cost to goal)
    f: number; // Total cost (g + h)
}

export class Planner {
    public plan(currentState: WorldState, goal: Goal, availableActions: Action[]): Action[] | null {
        // Simple priority queue (can be optimized)
        const openSet: Node[] = [];
        const closedSet: Set<string> = new Set(); // Using JSON stringify for state key? Might be slow. Ideally hash.

        const startNode: Node = {
            action: null,
            parent: null,
            state: { ...currentState },
            g: 0,
            h: this.calculateHeuristic(currentState, goal.desiredState),
            f: 0,
        };
        startNode.f = startNode.h;
        openSet.push(startNode);

        while (openSet.length > 0) {
            // Sort by f-score (lowest first)
            openSet.sort((a, b) => a.f - b.f);
            const currentNode = openSet.shift()!;

            if (this.isGoalMet(currentNode.state, goal.desiredState)) {
                return this.reconstructPath(currentNode);
            }

            // Simple state hashing for closed set
            const stateKey = JSON.stringify(currentNode.state);
            if (closedSet.has(stateKey)) {
                // If we found a better path to this state, we should have updated it in openSet,
                // BUT simple A* with closed set usually ignores revisited states unless g is lower.
                // For now, simpler implementation: just skip.
                continue;
            }
            closedSet.add(stateKey);

            for (const action of availableActions) {
                if (!action.isValid()) continue;
                if (!this.arePreconditionsMet(currentNode.state, action.preconditions)) continue;

                const newState = this.applyEffects(currentNode.state, action.effects);
                const g = currentNode.g + action.getCost();
                const h = this.calculateHeuristic(newState, goal.desiredState);

                const neighbor: Node = {
                    action,
                    parent: currentNode,
                    state: newState,
                    g,
                    h,
                    f: g + h,
                };

                // Ideally verify if we have a better path to this state in openSet
                // But simplified: just add to openSet.
                openSet.push(neighbor);
            }
        }
        return null; // No plan found
    }

    private arePreconditionsMet(state: WorldState, preconditions: WorldState): boolean {
        for (const key in preconditions) {
            const expected = preconditions[key];
            const actual = state[key];

            if (typeof expected === "boolean") {
                if (actual !== expected) return false;
            } else if (typeof expected === "number") {
                // Basic implementation: Numbers must be >= expected for preconditions? Or exact?
                // Usually for resources, it's >=.
                // For now strict equality unless we define types.
                // Let's assume strict equality for simplicity in v1.
                if (typeof actual !== "number" || actual < expected) return false;
            }
        }
        return true;
    }

    private isGoalMet(state: WorldState, goalState: WorldState): boolean {
        for (const key in goalState) {
            const expected = goalState[key];
            const actual = state[key];
            if (typeof expected === "boolean") {
                if (actual !== expected) return false;
            } else if (typeof expected === "number") {
                if (typeof actual !== "number" || actual < expected) return false;
            }
        }
        return true;
    }

    private applyEffects(state: WorldState, effects: WorldState): WorldState {
        const newState = { ...state };
        for (const key in effects) {
            const effect = effects[key];
            if (typeof effect === "number" && typeof newState[key] === "number") {
                // Determine if effects are additive or replacements?
                // Standard GOAP usually replaces state for booleans.
                // For numbers, it could be confusing.
                // Let's assume replacement for now to keep it deterministic.
                newState[key] = effect;
            } else {
                newState[key] = effect;
            }
        }
        return newState;
    }

    private calculateHeuristic(state: WorldState, goalState: WorldState): number {
        let cost = 0;
        for (const key in goalState) {
            const expected = goalState[key];
            const actual = state[key];
            if (expected !== actual) {
                cost += 1; // Simple mismatch cost
            }
        }
        return cost;
    }

    private reconstructPath(node: Node): Action[] {
        const path: Action[] = [];
        let current: Node | null = node;
        while (current && current.action) {
            path.unshift(current.action);
            current = current.parent;
        }
        return path;
    }
}
