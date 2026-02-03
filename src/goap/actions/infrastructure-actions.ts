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
        // Can only build if we are at required RCL
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

        if (currentExtensions >= this.targetCount) {
            return true;
        }

        // Check for construction sites
        const currentSites = room.find(FIND_CONSTRUCTION_SITES, {
            filter: s => s.structureType === STRUCTURE_EXTENSION && s.my,
        }).length;

        if (currentExtensions + currentSites < this.targetCount) {
            // Place more sites
            console.log(`GOAP: Placing extension sites to reach ${this.targetCount}`);
            const center = ConstructionUtils.findSuitableExtensionClusterPosition(spawn, room);
            if (center) {
                ConstructionUtils.buildExtensionCluster(center, room);
            }
        }

        // If sites exist, we wait for builders (managed by GoapSystem spawning builders)
        return false;
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
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn) return true;

        // We assume if we run this, we place roads.
        // To avoid spamming, we could check if roads exist, but ConstructionUtils.buildRoads checks for existing roads.
        // However, checks are cheap enough for occasional run.

        // This effectively runs "ensure roads exist".
        // Returns true only when roads are built? Or just placed?
        // If we want "hasRoads" to mean "Roads are built", we must return false until built.

        // Let's implement placement first.
        ConstructionUtils.buildRoadsAroundPosition(spawn.pos);
        ConstructionUtils.buildRoadsToEnergySources(room, spawn.pos);
        ConstructionUtils.buildRoadsToController(room, spawn.pos);

        // Check if all roads are built (no construction sites for roads)
        const roadSites = room.find(FIND_CONSTRUCTION_SITES, {
            filter: { structureType: STRUCTURE_ROAD },
        });

        if (roadSites.length === 0) {
            // Also ideally check if roads actually exist, but for now assuming placement -> build -> done.
            return true;
        }

        return false;
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

        const containers = room.find(FIND_STRUCTURES, { filter: { structureType: STRUCTURE_CONTAINER } });
        if (containers.length > 0) return true;

        const sites = room.find(FIND_CONSTRUCTION_SITES, { filter: { structureType: STRUCTURE_CONTAINER } });
        if (sites.length === 0) {
            ConstructionUtils.constructFirstContainer(spawn);
        }

        return false;
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

        const towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
        if (towers.length > 0) return true;

        const sites = room.find(FIND_CONSTRUCTION_SITES, { filter: { structureType: STRUCTURE_TOWER } });
        if (sites.length === 0) {
            ConstructionUtils.buildFirstTower(spawn);
        }

        return false; // Wait for build
    }
}
