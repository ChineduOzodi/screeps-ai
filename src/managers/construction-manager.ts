import { ColonyManager } from "../prototypes/types";
import { ConstructionUtils } from "../utils/construction-utils";
import { MinCut } from "../utils/min-cut";
import { REPAIR_THRESHOLD_DECAY_PREVENTION, REPAIR_THRESHOLD_EMERGENCY } from "../constants/repair-constants";
import { RepairUtils } from "../utils/repair-utils";
import { Logger } from "../utils/logger";

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
    emergencyHits: number;
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
            this.planTowers();
            this.planLinks();
            this.planExtractor();
            this.planTerminal();
            this.planLabs();
            this.planFactory();
            this.planObserver();
            this.planRamparts();
            this.planPerimeter();
        }
    }

    /**
     * Plans a min-cut rampart perimeter that seals the base off from all exits.
     * Computed once per RCL (structures shift as the base grows) and built gradually.
     */
    private planPerimeter(): void {
        const room = this.colony.getMainRoom();
        if (!room || !room.controller || (room.controller.level || 0) < 4) return;
        if (typeof room.getTerrain !== "function") return;

        const defense = this.colony.colonyInfo.defenseManagement;
        if (!defense) return;

        const rcl = room.controller.level;
        if (!defense.perimeter || defense.lastPerimeterRcl !== rcl) {
            defense.perimeter = this.computePerimeter(room);
            defense.lastPerimeterRcl = rcl;
            if (defense.perimeter.length > 0) {
                Logger.info(`[Perimeter] ${room.name}: planned ${defense.perimeter.length} rampart positions`);
            }
        }

        // Build gradually: a few sites at a time so we don't flood the build queue.
        let placed = 0;
        for (const tile of defense.perimeter) {
            if (placed >= 5) break;
            if (Object.keys(Game.constructionSites).length >= 100) break;

            const pos = new RoomPosition(tile.x, tile.y, room.name);
            const hasRampart = pos.lookFor(LOOK_STRUCTURES).some(s => s.structureType === STRUCTURE_RAMPART);
            const hasSite = pos.lookFor(LOOK_CONSTRUCTION_SITES).some(s => s.structureType === STRUCTURE_RAMPART);
            if (hasRampart || hasSite) continue;

            if (room.createConstructionSite(pos, STRUCTURE_RAMPART) === OK) {
                placed++;
            }
        }
    }

    private computePerimeter(room: Room): { x: number; y: number }[] {
        const protectedTypes: StructureConstant[] = [
            STRUCTURE_SPAWN,
            STRUCTURE_EXTENSION,
            STRUCTURE_TOWER,
            STRUCTURE_STORAGE,
            STRUCTURE_TERMINAL,
            STRUCTURE_LAB,
            STRUCTURE_FACTORY,
        ];
        const positions = room
            .find(FIND_MY_STRUCTURES, { filter: s => protectedTypes.includes(s.structureType) })
            .map(s => ({ x: s.pos.x, y: s.pos.y }));

        if (positions.length === 0) return [];

        // Try to protect the controller too; fall back to just the core if that
        // pushes the protected area into an exit zone.
        const withController = room.controller
            ? [...positions, { x: room.controller.pos.x, y: room.controller.pos.y }]
            : positions;

        const terrain = room.getTerrain();
        let cut = MinCut.computeCut(terrain, MinCut.getProtectedRects(withController, 3), TERRAIN_MASK_WALL);
        if (cut.length === 0 && withController.length !== positions.length) {
            cut = MinCut.computeCut(terrain, MinCut.getProtectedRects(positions, 3), TERRAIN_MASK_WALL);
        }
        return cut;
    }

    /** Places ramparts over critical structures so they survive sieges. */
    private planRamparts(): void {
        const room = this.colony.getMainRoom();
        if (!room || !room.controller || (room.controller.level || 0) < 3) return;

        const protectedTypes: StructureConstant[] = [
            STRUCTURE_SPAWN,
            STRUCTURE_TOWER,
            STRUCTURE_STORAGE,
            STRUCTURE_TERMINAL,
            STRUCTURE_LAB,
            STRUCTURE_FACTORY,
            STRUCTURE_POWER_SPAWN,
            STRUCTURE_NUKER,
        ];

        const criticalStructures = room.find(FIND_MY_STRUCTURES, {
            filter: s => protectedTypes.includes(s.structureType),
        });

        for (const structure of criticalStructures) {
            if (Object.keys(Game.constructionSites).length >= 100) break;

            const pos = structure.pos;
            const hasRampart = pos.lookFor(LOOK_STRUCTURES).some(s => s.structureType === STRUCTURE_RAMPART);
            const hasRampartSite = pos
                .lookFor(LOOK_CONSTRUCTION_SITES)
                .some(s => s.structureType === STRUCTURE_RAMPART);

            if (!hasRampart && !hasRampartSite) {
                room.createConstructionSite(pos, STRUCTURE_RAMPART);
            }
        }
    }

    private planLabs(): void {
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn || !room.controller || (room.controller.level || 0) < 6) return;

        const rcl = room.controller.level;
        const maxLabs = (CONTROLLER_STRUCTURES[STRUCTURE_LAB] || {})[rcl] || 0;
        if (maxLabs === 0 || this.hasPlannedStructures(STRUCTURE_LAB, maxLabs)) return;
        if (Object.keys(Game.constructionSites).length >= 100) return;

        const currentCount =
            room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_LAB }).length +
            room.find(FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_LAB }).length;

        const needed = maxLabs - currentCount;
        if (needed <= 0) return;

        const structures = ConstructionUtils.getClusteredStructures(spawn, room, STRUCTURE_LAB, needed);
        this.placeConstructionSites(structures);
    }

    private planFactory(): void {
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn || !room.controller || (room.controller.level || 0) < 7) return;

        if (this.hasPlannedStructures(STRUCTURE_FACTORY, 1)) return;
        if (Object.keys(Game.constructionSites).length >= 100) return;

        const structures = ConstructionUtils.getClusteredStructures(spawn, room, STRUCTURE_FACTORY, 1);
        this.placeConstructionSites(structures);
    }

    private planObserver(): void {
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn || !room.controller || (room.controller.level || 0) < 8) return;

        if (this.hasPlannedStructures(STRUCTURE_OBSERVER, 1)) return;
        if (Object.keys(Game.constructionSites).length >= 100) return;

        const structures = ConstructionUtils.getClusteredStructures(spawn, room, STRUCTURE_OBSERVER, 1);
        this.placeConstructionSites(structures);
    }

    private planTerminal(): void {
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn || !room.controller || room.controller.level < 6) return;

        // Only 1 terminal per room
        if (this.hasPlannedStructures(STRUCTURE_TERMINAL, 1)) return;

        // Global limit check
        if (Object.keys(Game.constructionSites).length >= 100) return;

        const structures = ConstructionUtils.getFirstTerminalStructures(spawn);
        this.placeConstructionSites(structures);
    }

    private planExtractor(): void {
        const room = this.colony.getMainRoom();
        if (!room || !room.controller || room.controller.level < 6) return;

        // Only 1 extractor per room typically, but place one on each mineral
        if (this.hasPlannedStructures(STRUCTURE_EXTRACTOR, 1)) return;

        // Global limit check
        if (Object.keys(Game.constructionSites).length >= 100) return;

        const minerals = room.find(FIND_MINERALS);
        const structures: ProjectStructure[] = [];
        for (const mineral of minerals) {
            structures.push({ x: mineral.pos.x, y: mineral.pos.y, roomName: room.name, type: STRUCTURE_EXTRACTOR });
        }

        this.placeConstructionSites(structures);
    }

    public planLinks(): void {
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn || !room.controller) return;

        const rcl = room.controller.level;
        if (rcl < 5) return;

        const maxLinks = CONTROLLER_STRUCTURES[STRUCTURE_LINK][rcl] || 0;

        // Count existing links and construction sites
        const currentCount =
            room.find(FIND_MY_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_LINK,
            }).length +
            room.find(FIND_MY_CONSTRUCTION_SITES, {
                filter: s => s.structureType === STRUCTURE_LINK,
            }).length;

        if (currentCount >= maxLinks) return;

        const needed = maxLinks - currentCount;

        // Global limit check
        if (Object.keys(Game.constructionSites).length >= 100) return;

        const sources = room.find(FIND_SOURCES);
        const structures = ConstructionUtils.getLinkStructures(room, spawn, needed, sources);
        this.placeConstructionSites(structures);
    }

    public planTowers(): void {
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn || !room.controller) return;

        const rcl = room.controller.level;
        if (rcl < 3) return;

        const maxTowers = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][rcl] || 0;

        // Count existing towers and construction sites
        const currentCount =
            room.find(FIND_MY_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_TOWER,
            }).length +
            room.find(FIND_MY_CONSTRUCTION_SITES, {
                filter: s => s.structureType === STRUCTURE_TOWER,
            }).length;

        if (currentCount >= maxTowers) return;

        const needed = maxTowers - currentCount;

        // Global limit check
        if (Object.keys(Game.constructionSites).length >= 100) return;

        const structures = ConstructionUtils.getTowerStructures(spawn, needed);
        this.placeConstructionSites(structures);
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
                    Logger.info(
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
            return {
                totalNeeded: 0,
                maintenanceHits: 0,
                fortificationHits: 0,
                emergencyHits: 0,
                lastCheck: Game.time,
            };
        }

        if (!room.memory.repairStats) {
            room.memory.repairStats = {
                totalNeeded: 0,
                maintenanceHits: 0,
                fortificationHits: 0,
                emergencyHits: 0,
                lastCheck: 0,
            };
        }

        const stats = room.memory.repairStats as RepairStats;
        if (Game.time - stats.lastCheck > 50) {
            const targets = room.find(FIND_STRUCTURES);
            const rcl = room.controller?.level || 0;

            let totalNeeded = 0;
            let fortificationHits = 0;
            let emergencyHits = 0;

            for (const target of targets) {
                const targetHits = RepairUtils.getStructureTargetHits(target, rcl);
                if (target.hits < targetHits) {
                    const diff = targetHits - target.hits;
                    totalNeeded += diff;
                    if (target.structureType === STRUCTURE_WALL || target.structureType === STRUCTURE_RAMPART) {
                        fortificationHits += diff;
                        if (target.hits < REPAIR_THRESHOLD_DECAY_PREVENTION) {
                            emergencyHits += REPAIR_THRESHOLD_DECAY_PREVENTION - target.hits;
                        }
                    } else if (
                        target.hits < target.hitsMax * REPAIR_THRESHOLD_EMERGENCY ||
                        target.hits < REPAIR_THRESHOLD_DECAY_PREVENTION
                    ) {
                        emergencyHits += diff;
                    }
                }
            }

            stats.totalNeeded = totalNeeded;
            stats.maintenanceHits = RepairUtils.calculateMaintenanceNeed(room);
            stats.fortificationHits = fortificationHits;
            stats.emergencyHits = emergencyHits;
            stats.lastCheck = Game.time;
        }

        return stats;
    }
}
