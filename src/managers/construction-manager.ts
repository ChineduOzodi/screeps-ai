import { ColonyManager } from "../prototypes/types";
import { ConstructionUtils } from "../utils/construction-utils";
import { RepairUtils } from "../utils/repair-utils";

declare global {
    interface Game {
        player?: {
            name: string;
        };
    }
}

export interface ProjectStructure {
    x: number;
    y: number;
    roomName: string;
    type: StructureConstant;
}

export interface RepairStats {
    totalNeeded: number;
    maintenanceHits: number;
    fortificationHits: number;
    lastCheck: number;
}

export class ConstructionManager {
    private colony: ColonyManager;

    constructor(colony: ColonyManager) {
        this.colony = colony;
    }

    /**
     * Places construction sites for a list of structures if they don't already exist.
     * Does not track them in memory.
     */
    public placeConstructionSites(structures: ProjectStructure[]): void {
        for (const s of structures) {
            if (Object.keys(Game.constructionSites).length >= 100) break;
            this.createSiteIfNeeded(s);
        }
    }

    public run(): void {
        const room = this.colony.getMainRoom();
        if (!room) return;

        // Rebuild ruins we "own" (or are in our controlled/reserved rooms), except roads.
        if (Game.time % 10 === 0) {
            this.rebuildRuins();
            this.planExtensions();
            this.planStorage();
        }
    }

    private planStorage(): void {
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn || !room.controller || room.controller.level < 4) return;

        // Only 1 storage per room
        if (this.hasPlannedStructures(STRUCTURE_STORAGE, 1)) return;

        // Global limit check
        if (Object.keys(Game.constructionSites).length >= 100) return;

        const structures = ConstructionUtils.getFirstStorageStructures(spawn);
        this.placeConstructionSites(structures);
    }

    private planExtensions(): void {
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn || !room.controller) return;

        const rcl = room.controller.level;
        const maxExtensions = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][rcl] || 0;

        // Count existing extensions and construction sites
        const currentCount =
            room.find(FIND_MY_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_EXTENSION,
            }).length +
            room.find(FIND_MY_CONSTRUCTION_SITES, {
                filter: s => s.structureType === STRUCTURE_EXTENSION,
            }).length;

        if (currentCount >= maxExtensions) return;

        let needed = maxExtensions - currentCount;
        const candidates = ConstructionUtils.getExtensionClusterCandidates();
        const extOffsets = ConstructionUtils.getExtensionClusterOffsets();
        const roadOffsets = ConstructionUtils.getExtensionRoadOffsets();

        for (const delta of candidates) {
            if (Object.keys(Game.constructionSites).length >= 100) break;

            const centerX = spawn.pos.x + delta.dx;
            const centerY = spawn.pos.y + delta.dy;
            if (centerX < 2 || centerX > 47 || centerY < 2 || centerY > 47) continue;

            if (!this.isClusterPatternPossible(room, centerX, centerY)) continue;

            let placedInCluster = 0;
            // Count already placed extensions in this cluster to avoid road-only clusters
            let existingInCluster = 0;

            // Try to place extensions in this cluster
            for (const offset of extOffsets) {
                if (Object.keys(Game.constructionSites).length >= 100) break;

                const pos = new RoomPosition(centerX + offset.x, centerY + offset.y, room.name);

                // Check if an extension already exists or is planned here
                const existingExt = pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_EXTENSION);
                const existingSite = pos
                    .lookFor(LOOK_CONSTRUCTION_SITES)
                    .find(s => s.structureType === STRUCTURE_EXTENSION);

                if (existingExt || existingSite) {
                    existingInCluster++;
                    continue;
                }

                if (needed > 0 && ConstructionUtils.isTileClearForStructure(pos, room, true)) {
                    // Destroy road or remove road site if blocking
                    const road = pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_ROAD);
                    if (road) {
                        road.destroy();
                    }
                    const roadSite = pos.lookFor(LOOK_CONSTRUCTION_SITES).find(s => s.structureType === STRUCTURE_ROAD);
                    if (roadSite) {
                        roadSite.remove();
                    }

                    const result = room.createConstructionSite(pos, STRUCTURE_EXTENSION);
                    if (result === OK) {
                        needed--;
                        placedInCluster++;
                    }
                }
            }

            // Also place roads for this cluster if we just placed a NEW extension
            if (placedInCluster > 0) {
                for (const offset of roadOffsets) {
                    if (Object.keys(Game.constructionSites).length >= 100) break;

                    const pos = new RoomPosition(centerX + offset.x, centerY + offset.y, room.name);
                    if (ConstructionUtils.isTileClearForStructure(pos, room, true)) {
                        room.createConstructionSite(pos, STRUCTURE_ROAD);
                    }
                }
            }

            if (needed <= 0) break;
        }
    }

    private isClusterPatternPossible(room: Room, centerX: number, centerY: number): boolean {
        const extOffsets = ConstructionUtils.getExtensionClusterOffsets();
        const roadOffsets = ConstructionUtils.getExtensionRoadOffsets();

        for (const offset of extOffsets) {
            const pos = new RoomPosition(centerX + offset.x, centerY + offset.y, room.name);
            const structures = pos.lookFor(LOOK_STRUCTURES);
            const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);

            const hasExtension = structures.some(s => s.structureType === STRUCTURE_EXTENSION);
            const hasExtensionSite = sites.some(s => s.structureType === STRUCTURE_EXTENSION);

            if (!hasExtension && !hasExtensionSite) {
                // If no extension, it MUST be clear for a new one (ignoring roads)
                if (!ConstructionUtils.isTileClearForStructure(pos, room, true)) return false;
            }
        }

        for (const offset of roadOffsets) {
            const pos = new RoomPosition(centerX + offset.x, centerY + offset.y, room.name);
            const structures = pos.lookFor(LOOK_STRUCTURES);
            const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);

            const hasRoad = structures.some(s => s.structureType === STRUCTURE_ROAD);
            const hasRoadSite = sites.some(s => s.structureType === STRUCTURE_ROAD);

            if (!hasRoad && !hasRoadSite) {
                // If no road, it MUST be clear for a new one
                if (!ConstructionUtils.isTileClearForStructure(pos, room, true)) return false;
            }
        }

        return true;
    }

    private rebuildRuins(): void {
        // Search in all visible rooms? Or just main room?
        // Let's check all rooms where we have vision and might have structures.
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            const isMyRoom = room.controller?.my;
            const isReserved =
                room.controller?.reservation && room.controller.reservation.username === Game.player?.name;

            // Only care about rooms we control or reserve
            if (!isMyRoom && !isReserved) continue;

            const ruins = room.find(FIND_RUINS, {
                filter: ruin => {
                    // Skip roads
                    if (ruin.structure.structureType === STRUCTURE_ROAD) return false;

                    // Rebuild if it was an owned structure and it's ours
                    if ("owner" in ruin.structure) {
                        return (ruin.structure as any).owner?.username === Game.player?.name;
                    }

                    // For neutral structures (like containers), rebuild if in our room
                    return true;
                },
            });

            for (const ruin of ruins) {
                if (Object.keys(Game.constructionSites).length >= 100) break;

                // Check if site already exists
                const sites = ruin.pos.lookFor(LOOK_CONSTRUCTION_SITES);
                if (sites.length > 0) continue;

                const result = room.createConstructionSite(ruin.pos, ruin.structure.structureType);
                if (result === OK) {
                    console.log(
                        `ConstructionManager: Rebuilding ${ruin.structure.structureType} from ruin at ${ruin.pos}`,
                    );
                }
            }
        }
    }

    private createSiteIfNeeded(s: ProjectStructure): void {
        const room = Game.rooms[s.roomName];
        if (!room) return; // No vision

        const pos = new RoomPosition(s.x, s.y, s.roomName);

        // Check if structure exists
        const structure = pos.lookFor(LOOK_STRUCTURES).find(st => st.structureType === s.type);
        if (structure) return;

        // Check if site exists
        const site = pos.lookFor(LOOK_CONSTRUCTION_SITES).find(st => st.structureType === s.type);
        if (site) return;

        // Limit check
        if (Object.keys(Game.constructionSites).length >= 100) return;

        room.createConstructionSite(pos, s.type);
    }

    /**
     * Checks if we have at least 'count' structures or construction sites of a given type in the main room.
     */
    public hasPlannedStructures(type: StructureConstant, count: number): boolean {
        const room = this.colony.getMainRoom();
        if (!room) return false;

        const structures = room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === type && (s as any).my !== false,
        }).length;

        const sites = room.find(FIND_CONSTRUCTION_SITES, {
            filter: s => s.structureType === type && (s as any).my !== false,
        }).length;

        return structures + sites >= count;
    }

    public getRepairStats(): RepairStats {
        const room = this.colony.getMainRoom();
        if (!room || !room.memory) {
            return { totalNeeded: 0, maintenanceHits: 0, fortificationHits: 0, lastCheck: Game.time };
        }

        if (!room.memory.repairStats) {
            room.memory.repairStats = {
                totalNeeded: 0,
                maintenanceHits: 0,
                fortificationHits: 0,
                lastCheck: 0,
            };
        }

        const stats = room.memory.repairStats;
        if (Game.time - stats.lastCheck > 50) {
            const targets = room.find(FIND_STRUCTURES);
            const rcl = room.controller?.level || 0;

            let totalNeeded = 0;
            let fortificationHits = 0;

            for (const target of targets) {
                const targetHits = RepairUtils.getStructureTargetHits(target, rcl);
                if (target.hits < targetHits) {
                    const diff = targetHits - target.hits;
                    totalNeeded += diff;
                    if (target.structureType === STRUCTURE_WALL || target.structureType === STRUCTURE_RAMPART) {
                        fortificationHits += diff;
                    }
                }
            }

            stats.totalNeeded = totalNeeded;
            stats.maintenanceHits = RepairUtils.calculateMaintenanceNeed(room);
            stats.fortificationHits = fortificationHits;
            stats.lastCheck = Game.time;
        }

        return stats;
    }
}
