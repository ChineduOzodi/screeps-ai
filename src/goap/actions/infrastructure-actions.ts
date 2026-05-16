/* eslint-disable max-classes-per-file */
import { Action, WorldState } from "../types";
import { ColonyManager } from "../../prototypes/types";
import { ConstructionUtils } from "../../utils/construction-utils";

export class BuildContainerAction implements Action {
    name = "Build Container";
    cost = 10;
    private colony: ColonyManager;

    constructor(colony: ColonyManager) {
        this.colony = colony;
    }

    get preconditions(): WorldState {
        return { rcl: 1 };
    }

    get effects(): WorldState {
        return { hasContainer: true };
    }

    getCost() {
        return this.cost;
    }

    isValid() {
        return true;
    }

    execute(): boolean {
        this.colony.systems.builder.setEnergyBudgetWeight(1.0);
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn) return true;

        if (this.colony.constructionManager.hasPlannedStructures(STRUCTURE_CONTAINER, 1)) {
            return true;
        }

        const structures = ConstructionUtils.getFirstContainerStructures(spawn);
        this.colony.constructionManager.placeConstructionSites(structures);

        return true;
    }
}

export class BuildTowerAction implements Action {
    name = "Build Tower";
    cost = 15;
    private colony: ColonyManager;

    constructor(colony: ColonyManager) {
        this.colony = colony;
    }

    get preconditions(): WorldState {
        return { rcl: 3 };
    }

    get effects(): WorldState {
        return { hasTower: true };
    }

    getCost() {
        return this.cost;
    }

    isValid() {
        return (this.colony.getMainRoom().controller?.level || 0) >= 3;
    }

    execute(): boolean {
        this.colony.systems.builder.setEnergyBudgetWeight(1.0);
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn) return true;

        if (this.colony.constructionManager.hasPlannedStructures(STRUCTURE_TOWER, 1)) {
            return true;
        }

        const structures = ConstructionUtils.getFirstTowerStructures(spawn);
        if (structures.length > 0) {
            this.colony.constructionManager.placeConstructionSites(structures);
        }

        return true;
    }
}
