/* eslint-disable max-classes-per-file */
import { Action, WorldState } from "../types";
import { ColonyManager } from "../../prototypes/colony";
import { ConstructionUtils } from "../../utils/construction-utils";

export class BuildExtensionsAction implements Action {
    name: string;
    cost = 10;

    private colony: ColonyManager;
    private targetCount: number;

    constructor(colony: ColonyManager, targetCount: number) {
        this.colony = colony;
        this.targetCount = targetCount;
        this.name = `Build Extensions ${targetCount}`;
    }

    private getRequiredRCL(): number {
        if (this.targetCount <= 5) return 2;
        if (this.targetCount <= 10) return 3;
        return 4; // etc
    }

    get preconditions(): WorldState {
        return {
            rcl: this.getRequiredRCL(),
        };
    }

    get effects(): WorldState {
        return {
            extensions: this.targetCount,
        };
    }

    getCost() {
        return this.cost;
    }

    isValid() {
        return (this.colony.getMainRoom().controller?.level || 0) >= this.getRequiredRCL();
    }

    execute(): boolean {
        this.colony.systems.builder.setEnergyBudgetWeight(1.0);
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn) return true;

        const currentExtensions = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_EXTENSION },
        }).length;

        // If we have enough actual structures, we are definitely done.
        if (currentExtensions >= this.targetCount) {
            return true;
        }

        const projectName = `Extensions_Target_${this.targetCount}`;

        // If project is complete (sites exist or structures exist), we consider this action "done" regarding planning.
        if (this.colony.constructionManager.isProjectComplete(projectName)) {
            return true;
        }

        const center = ConstructionUtils.findSuitableExtensionClusterPosition(spawn, room);
        if (center) {
            const structures = ConstructionUtils.getExtensionClusterStructures(center, room);
            this.colony.constructionManager.buildProject(projectName, structures);
        }

        return true;
    }
}

export class BuildRoadsAction implements Action {
    name = "Build Roads";
    cost = 5;
    private colony: ColonyManager;

    constructor(colony: ColonyManager) {
        this.colony = colony;
    }

    get preconditions(): WorldState {
        return {
            rcl: 1,
        };
    }

    get effects(): WorldState {
        return {
            hasRoads: true,
        };
    }

    getCost() {
        return this.cost;
    }

    isValid() {
        return true;
    }

    execute(): boolean {
        this.colony.systems.builder.setEnergyBudgetWeight(1.0);

        this.colony.roadManager.planColonyRoads();

        return true;
    }
}

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

        const projectName = "First_Container";
        if (this.colony.constructionManager.isProjectComplete(projectName)) {
            return true;
        }

        const structures = ConstructionUtils.getFirstContainerStructures(spawn);
        this.colony.constructionManager.buildProject(projectName, structures);

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
        const spawn = this.colony.getMainSpawn();
        if (!spawn) return true;

        const projectName = "First_Tower";

        const structures = ConstructionUtils.getFirstTowerStructures(spawn);
        if (structures.length > 0) {
            this.colony.constructionManager.buildProject(projectName, structures);
        }

        return true;
    }
}
