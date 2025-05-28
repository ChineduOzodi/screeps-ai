import { BaseSystemImpl } from "./base-system";
import { BuilderCreepSpawner } from "creep-roles/builder-creep";
import { CreepRole } from "prototypes/creep";
import { CreepSpawner } from "prototypes/CreepSpawner";

export class BuilderSystem extends BaseSystemImpl {
    public override get systemInfo(): ColonyBuilderManagement {
        if (!this.colony.colonyInfo.builderManagement) {
            this.colony.colonyInfo.builderManagement = {
                nextUpdate: Game.time,
                buildQueue: [],
                creepSpawnersInfo: {},
            };
        }
        return this.colony.colonyInfo.builderManagement;
    }

    public override get energyUsageTracking(): EnergyUsageTracking {
        if (!this.systemInfo.energyUsageTracking) {
            this.systemInfo.energyUsageTracking = {
                actualEnergyUsagePercentage: 0,
                estimatedEnergyWorkRate: 0,
                requestedEnergyUsageWeight: 0.25,
                allowedEnergyWorkRate: 0,
            };
        }
        return this.systemInfo.energyUsageTracking;
    }

    public override onStart(): void {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        this.systemInfo;
    }
    public override run(): void {
        this.manageBuilders();
    }

    public override onLevelUp(level: number): void {
        switch (level) {
            // Assuming onLevelOne might be called if starting at RCL 1 or for consistency
            case 1:
                this.onLevelOne();
                break;
            case 2:
                this.onLevelTwo();
                break;
            case 3:
                this.onLevelThree();
                break;
            default:
                // No specific actions for other levels in this system yet
                break;
        }
    }

    public override getCreepSpawners(): CreepSpawner[] {
        return [new BuilderCreepSpawner()];
    }

    public manageBuilders(): void {
        const colonyManager = this.colony;

        this.systemInfo.buildQueue = this.getConstructionSites(colonyManager.colonyInfo).map(x => x.id);
        const { buildQueue } = this.systemInfo;
        if (buildQueue.length > 0) {
            this.energyUsageTracking.requestedEnergyUsageWeight = 0.5;
        } else {
            this.energyUsageTracking.requestedEnergyUsageWeight = 0;
        }
    }

    public getConstructionSites(colony: Colony): ConstructionSite<BuildableStructureConstant>[] {
        const constructionSites: ConstructionSite<BuildableStructureConstant>[] = [];
        for (const name in Game.constructionSites) {
            const site = Game.constructionSites[name];

            if (colony.rooms.find(x => site.room?.name === x.name)) {
                constructionSites.push(site);
            }
        }

        return constructionSites;
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.BUILDER];
    }

    private onLevelOne(): void {
        // Unlocks 5 containers and roads.

        this.constructFirstContainer();
        this.buildRoadsAroundPosition(this.colony.getMainSpawn().pos);
        this.buildRoadsToEnergySources();
        this.buildRoadsToController();
    }

    private constructFirstContainer(): void {
        const mainRoom = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (spawn) {
            const containerPos = new RoomPosition(spawn.pos.x + 2, spawn.pos.y, spawn.pos.roomName);
            mainRoom.createConstructionSite(containerPos, STRUCTURE_CONTAINER);
        }
    }

    private buildRoadsAroundPosition(pos: RoomPosition): void {
        // Build roads around the tower
        const roadPositions = [
            new RoomPosition(pos.x + 1, pos.y, pos.roomName),
            new RoomPosition(pos.x - 1, pos.y, pos.roomName),
            new RoomPosition(pos.x, pos.y + 1, pos.roomName),
            new RoomPosition(pos.x, pos.y - 1, pos.roomName),
            new RoomPosition(pos.x + 1, pos.y + 1, pos.roomName),
            new RoomPosition(pos.x - 1, pos.y - 1, pos.roomName),
            new RoomPosition(pos.x + 1, pos.y - 1, pos.roomName),
            new RoomPosition(pos.x - 1, pos.y + 1, pos.roomName),
        ];
        for (const pos of roadPositions) {
            const result = pos.createConstructionSite(STRUCTURE_ROAD);
            if (result === OK) {
                console.log(`SUCCESS: Placed road construction site at ${pos.x},${pos.y}`);
            } else {
                console.log(`WARN: Failed to place road construction site at ${pos.x},${pos.y}: ${result}`);
            }
        }
    }

    private buildRoadsToEnergySources(): void {
        const mainRoom = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();

        const sources = mainRoom.find(FIND_SOURCES);
        for (const source of sources) {

            this.buildRoads(spawn.pos, source.pos, 1);
        }
    }

    private buildRoadsToController(): void {
        const mainRoom = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        const controller = mainRoom.controller;
        if (controller) {
            this.buildRoads(spawn.pos, controller.pos, 3);
        }
    }

    private buildRoads(startPos: RoomPosition, endPos: RoomPosition, range: number): void {
        const path = startPos.findPathTo(endPos, {
            ignoreCreeps: true,
            ignoreDestructibleStructures: true,
            range: range,
            swampCost: 2,
        });

        for (const step of path) {
            const pos = new RoomPosition(step.x, step.y, startPos.roomName);
            if (pos.createConstructionSite(STRUCTURE_ROAD) === OK) {
                console.log(`Building road at ${pos}`);
            }
        }
    }

    private isTileClearForStructure(pos: RoomPosition, room: Room, ignoreRoads: boolean = false): boolean {
        if (pos.x < 1 || pos.x > 48 || pos.y < 1 || pos.y > 48) { // Stay away from room edges for multi-tile patterns
            return false;
        }
        const terrain = room.getTerrain();
        if (terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL) {
            return false;
        }

        const existingStructures = room.lookForAt(LOOK_STRUCTURES, pos).filter(
            structure => structure.structureType !== STRUCTURE_ROAD || !ignoreRoads);
        if (existingStructures.length > 0) {
            return false;
        }

        const existingConstructionSites = room.lookForAt(LOOK_CONSTRUCTION_SITES, pos).filter(
            site => site.structureType !== STRUCTURE_ROAD || !ignoreRoads);
        if (existingConstructionSites.length > 0) {
            return false;
        }

        return true;
    }

    private findSuitableExtensionClusterPosition(spawn: StructureSpawn, room: Room): RoomPosition | null {
        const spawnPos = spawn.pos;
        const roomName = room.name;

        const extensionOffsets = [
            { x: 0, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }
        ];
        const roadOffsets = [
            { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
            { x: 0, y: -2 }, { x: 0, y: 2 }, { x: -2, y: 0 }, { x: 2, y: 0 }
        ];

        const isClusterValidAtCenter = (center: RoomPosition): boolean => {
            for (const offset of extensionOffsets) {
                const extPos = new RoomPosition(center.x + offset.x, center.y + offset.y, roomName);
                if (!this.isTileClearForStructure(extPos, room)) return false;
            }
            for (const offset of roadOffsets) {
                const roadPos = new RoomPosition(center.x + offset.x, center.y + offset.y, roomName);
                if (!this.isTileClearForStructure(roadPos, room, true)) return false;
            }
            return true;
        };

        const spotCandidates = [
            { dx: 0, dy: -4 },  // Top
            { dx: -2, dy: -6 },  // Top-Left Diagonal
            { dx: 2, dy: -6 },  // Top-Right Diagonal
            { dx: 0, dy: -8 }, // Far Top
            { dx: -4, dy: 0 },  // Left
            { dx: -6, dy: -2 }, // Left-Top Diagonal
            { dx: -6, dy: 2 },  // Left-Bottom Diagonal
            { dx: -8, dy: 0 },  // Far Left
            { dx: 0, dy: 4 },   // Bottom
            { dx: -2, dy: 6 },  // Bottom-Left Diagonal
            { dx: 2, dy: 6 },   // Bottom-Right Diagonal
            { dx: 0, dy: 8 },   // Far Bottom
            // { dx: 4, dy: 0 }, // Right - uncomment if needed
        ];

        // Check primary spots
        for (const pDelta of spotCandidates) {
            const candidateCenter = new RoomPosition(spawnPos.x + pDelta.dx, spawnPos.y + pDelta.dy, roomName);
            if (isClusterValidAtCenter(candidateCenter)) {
                return candidateCenter;
            }
        }

        return null; // No suitable position found
    }

    private buildExtensionCluster(centerPos: RoomPosition, room: Room): void {
        const roomName = room.name;
        const extensionOffsets = [
            { x: 0, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }
        ];
        const roadOffsets = [
            { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
            { x: 0, y: -2 }, { x: 0, y: 2 }, { x: -2, y: 0 }, { x: 2, y: 0 }
        ];

        for (const offset of extensionOffsets) {
            const pos = new RoomPosition(centerPos.x + offset.x, centerPos.y + offset.y, roomName);
            const result = pos.createConstructionSite(STRUCTURE_EXTENSION);
            if (result === OK) {
                console.log(`SUCCESS: Placing extension CS at ${pos.x},${pos.y}`);
            } else {
                console.log(`WARN: Failed to place extension CS at ${pos.x},${pos.y}: ${result}`);
            }
        }

        for (const offset of roadOffsets) {
            const pos = new RoomPosition(centerPos.x + offset.x, centerPos.y + offset.y, roomName);
            const result = pos.createConstructionSite(STRUCTURE_ROAD);
             if (result === OK) {
                console.log(`SUCCESS: Placing road CS at ${pos.x},${pos.y}`);
            } else {
                // It's possible a road was planned by another part of the system (e.g. onLevelOne)
                // or a road already exists. This might not always be a hard error.
                console.log(`INFO: Failed to place road CS at ${pos.x},${pos.y}: ${result}. May already exist or be planned.`);
            }
        }
    }

    private onLevelTwo(): void {
        // Unlocks 5 extensions, ramparts, and walls.
        // This function will place the first 5 extensions and surrounding roads.
        const mainRoom = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();

        if (!mainRoom || !spawn) {
            console.log("WARN: Main room or spawn not found for onLevelTwo operations.");
            return;
        }

        console.log(`INFO: Colony ${this.colony.colonyInfo.id} reached RCL 2. Attempting to build first extension cluster.`);

        const clusterCenterPosition = this.findSuitableExtensionClusterPosition(spawn, mainRoom);

        if (clusterCenterPosition) {
            console.log(`INFO: Found suitable position for extension cluster at ${clusterCenterPosition.x},${clusterCenterPosition.y}`);
            this.buildExtensionCluster(clusterCenterPosition, mainRoom);
        } else {
            console.log("WARN: Could not find a suitable position for the first extension cluster at RCL 2.");
        }
    }

    private buildStructure(structureType: BuildableStructureConstant, pos: RoomPosition, buildRoadsAround: boolean = false): void {
        const result = pos.createConstructionSite(structureType);
        if (result === OK) {
            console.log(`SUCCESS: Placed ${structureType} construction site at ${pos.x},${pos.y}`);
        } else {
            console.log(`WARN: Failed to place ${structureType} construction site at ${pos.x},${pos.y}: ${result}`);
        }

        if (!buildRoadsAround) {
            return;
        }
        this.buildRoadsAroundPosition(pos);
    }

    private buildFirstTower(): void {
        const mainRoom = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();

        if (!mainRoom || !spawn) {
            console.log("WARN: Main room or spawn not found for building first tower.");
            return;
        }

        const towerPosition = new RoomPosition(spawn.pos.x + 2, spawn.pos.y + 2, spawn.pos.roomName);
        if (this.isTileClearForStructure(towerPosition, mainRoom, true)) {
            this.buildStructure(STRUCTURE_TOWER, towerPosition, true);
        } else {
            console.log(`WARN: Tower position at ${towerPosition.x},${towerPosition.y} is not clear.`);
        }
    }

    private onLevelThree(): void {
        // Unlocks 5 more extensions, and 1 tower.

        const mainRoom = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();

        console.log(`INFO: Colony ${this.colony.colonyInfo.id} reached RCL 3. Attempting to build second extension cluster.`);

        const clusterCenterPosition = this.findSuitableExtensionClusterPosition(spawn, mainRoom);

        if (clusterCenterPosition) {
            console.log(`INFO: Found suitable position for extension cluster at ${clusterCenterPosition.x},${clusterCenterPosition.y}`);
            this.buildExtensionCluster(clusterCenterPosition, mainRoom);
        } else {
            console.log("WARN: Could not find a suitable position for the first extension cluster at RCL 3.");
        }

        this.buildFirstTower();
    }
}
