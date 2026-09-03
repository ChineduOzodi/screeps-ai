import { ColonyManager } from "../prototypes/types";
import { ConstructionUtils } from "../utils/construction-utils";
import { CorePlan, CorePlanner } from "../utils/core-planner";
import { ExtensionPlan, ExtensionPlanner } from "../utils/extension-planner";
import { PerimeterPlanner, PerimeterStructure, PerimeterTile } from "../utils/perimeter-planner";
import { REPAIR_THRESHOLD_DECAY_PREVENTION, REPAIR_THRESHOLD_EMERGENCY } from "../constants/repair-constants";
import { RepairUtils } from "../utils/repair-utils";
import { RoomSurvey, surveyRoom } from "../utils/room-survey";
import { Tile } from "../utils/room-grid";
import { Logger } from "../utils/logger";

declare global {
    interface Game {
        player?: {
            name: string;
        };
    }
}

/** Ticks to wait before re-running a planner on a room it could not fully lay out. */
const REPLAN_INTERVAL = 500;
/** Road sites laid through the extension field per planning pass. */
const EXTENSION_ROADS_PER_PASS = 5;
/** Extensions that must border a walkway before it is worth paving. */
const EXTENSION_ROAD_ADJACENCY = 2;
/** Bump when the perimeter algorithm changes so rooms with a cached plan re-plan. */
const PERIMETER_PLAN_VERSION = 2;

function isPerimeterStructure(type: StructureConstant): boolean {
    return type === STRUCTURE_WALL || type === STRUCTURE_RAMPART;
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
    /** Room survey memo: several planners want it in the same tick. */
    private survey?: { tick: number; roomName: string; data: RoomSurvey };

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
     * Plans a min-cut perimeter that seals the base off from all exits: walls along the
     * line, short rampart gates where traffic crosses, existing walls reused. Computed
     * once per RCL (structures shift as the base grows) and built gradually.
     */
    private planPerimeter(): void {
        const room = this.colony.getMainRoom();
        if (!room || !room.controller || (room.controller.level || 0) < 4) return;
        if (typeof room.getTerrain !== "function") return;

        const defense = this.colony.colonyInfo.defenseManagement;
        if (!defense) return;

        const rcl = room.controller.level;
        if (
            !defense.perimeter ||
            defense.lastPerimeterRcl !== rcl ||
            defense.perimeterVersion !== PERIMETER_PLAN_VERSION
        ) {
            defense.perimeter = this.computePerimeter(room);
            defense.lastPerimeterRcl = rcl;
            defense.perimeterVersion = PERIMETER_PLAN_VERSION;
            this.removeStalePerimeterSites(room, defense.perimeter);
            if (defense.perimeter.length > 0) {
                const ramparts = defense.perimeter.filter(t => t.structureType === STRUCTURE_RAMPART).length;
                Logger.info(
                    `[Perimeter] ${room.name}: planned ${defense.perimeter.length} tiles ` +
                        `(${ramparts} ramparts, ${defense.perimeter.length - ramparts} walls)`,
                );
            }
        }

        // Build gradually: a few sites at a time so we don't flood the build queue.
        let placed = 0;
        for (const tile of defense.perimeter) {
            if (placed >= 5) break;
            if (Object.keys(Game.constructionSites).length >= 100) break;

            const pos = new RoomPosition(tile.x, tile.y, room.name);
            const sealed = pos.lookFor(LOOK_STRUCTURES).some(s => isPerimeterStructure(s.structureType));
            const hasSite = pos.lookFor(LOOK_CONSTRUCTION_SITES).some(s => isPerimeterStructure(s.structureType));
            if (sealed || hasSite) continue;

            if (room.createConstructionSite(pos, tile.structureType) === OK) {
                placed++;
            }
        }
    }

    private computePerimeter(room: Room): PerimeterTile[] {
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

        // Walls (whoever built them) and our ramparts already hold the line. Anything else
        // standing on a tile rules out a wall there, so the plan ramparts it instead.
        const blockers: Tile[] = [];
        const passable: Tile[] = [];
        for (const s of room.find(FIND_STRUCTURES)) {
            const tile = { x: s.pos.x, y: s.pos.y };
            if (s.structureType === STRUCTURE_WALL) blockers.push(tile);
            else if (s.structureType === STRUCTURE_RAMPART) {
                if ((s as StructureRampart).my) blockers.push(tile);
            } else passable.push(tile);
        }
        for (const site of room.find(FIND_CONSTRUCTION_SITES)) {
            if (!isPerimeterStructure(site.structureType)) passable.push({ x: site.pos.x, y: site.pos.y });
        }

        const terrain = room.getTerrain();
        const plan = (protect: Tile[]) => PerimeterPlanner.plan({ terrain, protect, blockers, passable });

        // Try to protect the controller too; fall back to just the core if that
        // pushes the protected area into an exit zone.
        if (room.controller) {
            const withController = plan([...positions, { x: room.controller.pos.x, y: room.controller.pos.y }]);
            if (withController.length > 0) return withController;
        }
        return plan(positions);
    }

    /** Drops unbuilt wall/rampart sites that a fresh plan no longer wants. */
    private removeStalePerimeterSites(room: Room, perimeter: PerimeterTile[]): void {
        const planned = new Map<string, PerimeterStructure>();
        for (const t of perimeter) planned.set(`${t.x},${t.y}`, t.structureType);

        for (const site of room.find(FIND_MY_CONSTRUCTION_SITES)) {
            if (!isPerimeterStructure(site.structureType)) continue;
            if (planned.get(`${site.pos.x},${site.pos.y}`) === site.structureType) continue;
            // Ramparts over our own buildings come from planRamparts, not the perimeter.
            const covers = site.pos
                .lookFor(LOOK_STRUCTURES)
                .some(s => (s as OwnedStructure).my && !isPerimeterStructure(s.structureType));
            if (site.structureType === STRUCTURE_RAMPART && covers) continue;
            site.remove();
        }
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

        const structures = this.getCorePlan(room, spawn)
            .labs.slice(0, maxLabs)
            .map(tile => ({ x: tile.x, y: tile.y, roomName: room.name, type: STRUCTURE_LAB }));
        this.placeConstructionSites(structures);
    }

    private planFactory(): void {
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn || !room.controller || (room.controller.level || 0) < 7) return;

        if (this.hasPlannedStructures(STRUCTURE_FACTORY, 1)) return;
        if (Object.keys(Game.constructionSites).length >= 100) return;

        const factory = this.getCorePlan(room, spawn).factory;
        if (!factory) return;
        this.placeConstructionSites([{ x: factory.x, y: factory.y, roomName: room.name, type: STRUCTURE_FACTORY }]);
    }

    private planObserver(): void {
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn || !room.controller || (room.controller.level || 0) < 8) return;

        if (this.hasPlannedStructures(STRUCTURE_OBSERVER, 1)) return;
        if (Object.keys(Game.constructionSites).length >= 100) return;

        const observer = this.getCorePlan(room, spawn).observer;
        if (!observer) return;
        this.placeConstructionSites([{ x: observer.x, y: observer.y, roomName: room.name, type: STRUCTURE_OBSERVER }]);
    }

    private planTerminal(): void {
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn || !room.controller || room.controller.level < 6) return;

        // Only 1 terminal per room
        if (this.hasPlannedStructures(STRUCTURE_TERMINAL, 1)) return;

        // Global limit check
        if (Object.keys(Game.constructionSites).length >= 100) return;

        const terminal = this.getCorePlan(room, spawn).terminal;
        if (!terminal) return;
        this.placeConstructionSites([{ x: terminal.x, y: terminal.y, roomName: room.name, type: STRUCTURE_TERMINAL }]);
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
        const hubLink = this.getCorePlan(room, spawn).link;
        const structures = ConstructionUtils.getLinkStructures(room, spawn, needed, sources, hubLink);
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

        // Global limit check
        if (Object.keys(Game.constructionSites).length >= 100) return;

        const core = this.getCorePlan(room, spawn);
        const structures = core.towers
            .slice(0, maxTowers)
            .map(tile => ({ x: tile.x, y: tile.y, roomName: room.name, type: STRUCTURE_TOWER }));
        this.placeConstructionSites(structures);

        // Towers are traffic magnets for repairers and fillers; keep a road beside each,
        // but never on a tile another plan has already claimed.
        const claimed = this.claimedTiles(room, core);
        for (const tower of structures) {
            const roads = ConstructionUtils.getRoadsAroundPosition(
                new RoomPosition(tower.x, tower.y, room.name),
            ).filter(road => !claimed.has(`${road.x},${road.y}`));
            this.placeConstructionSites(roads);
        }
    }

    /** Tiles the core and extension plans have spoken for, as "x,y" keys. */
    private claimedTiles(room: Room, core: CorePlan): Set<string> {
        const tiles = [...CorePlanner.planTiles(core), ...(room.memory?.extensionPlan?.extensions ?? [])];
        return new Set(tiles.map(tile => `${tile.x},${tile.y}`));
    }

    private planStorage(): void {
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn || !room.controller || room.controller.level < 4) return;

        // Only 1 storage per room
        if (this.hasPlannedStructures(STRUCTURE_STORAGE, 1)) return;

        // Global limit check
        if (Object.keys(Game.constructionSites).length >= 100) return;

        const storage = this.getCorePlan(room, spawn).storage;
        if (!storage) return;
        this.placeConstructionSites([{ x: storage.x, y: storage.y, roomName: room.name, type: STRUCTURE_STORAGE }]);
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
        const plan = this.getExtensionPlan(room, spawn, maxExtensions);

        for (const tile of plan.extensions) {
            if (needed <= 0) break;
            if (Object.keys(Game.constructionSites).length >= 100) break;

            const pos = new RoomPosition(tile.x, tile.y, room.name);
            const structures = pos.lookFor(LOOK_STRUCTURES);
            const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);

            // Already built or queued here; it is part of currentCount.
            if (
                structures.some(s => s.structureType === STRUCTURE_EXTENSION) ||
                sites.some(s => s.structureType === STRUCTURE_EXTENSION)
            ) {
                continue;
            }

            if (!ConstructionUtils.isTileClearForStructure(pos, room, true)) continue;

            // A road laid earlier may sit on the tile; extensions win.
            structures.find(s => s.structureType === STRUCTURE_ROAD)?.destroy();
            sites.find(s => s.structureType === STRUCTURE_ROAD)?.remove();

            if (room.createConstructionSite(pos, STRUCTURE_EXTENSION) === OK) {
                needed--;
            }
        }

        this.planExtensionRoads(room, plan);
    }

    /**
     * The extension field is planned once and cached in room memory. It is replanned when
     * the cached tiles can no longer hold the extensions this RCL allows - but no more
     * often than REPLAN_INTERVAL, since a cramped room may simply have fewer
     * usable tiles than the RCL cap and would otherwise replan on every pass.
     */
    private getExtensionPlan(room: Room, spawn: StructureSpawn, needed: number): ExtensionPlan {
        const cached = room.memory?.extensionPlan;
        if (cached && cached.spawnId === spawn.id) {
            if (this.countUsablePlanTiles(room, cached.extensions) >= needed) return cached;
            if (Game.time - cached.plannedAt < REPLAN_INTERVAL) return cached;
        }

        const capacity = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][8] || 60;
        const core = this.getCorePlan(room, spawn);
        const plan = ExtensionPlanner.forRoom(room, spawn, capacity, this.getSurvey(room), CorePlanner.planTiles(core));
        if (room.memory) {
            room.memory.extensionPlan = {
                spawnId: spawn.id,
                plannedAt: Game.time,
                extensions: plan.extensions,
                roads: plan.roads,
            };
        }
        Logger.info(`[Extensions] ${room.name}: planned ${plan.extensions.length} extension tiles`);
        return plan;
    }

    /**
     * The base core - storage, terminal, hub link and towers - is laid out once and cached
     * in room memory, so the extension field can reserve its tiles and every pass places
     * the same structures in the same spots. Replanned on the same terms as the extension
     * field: only when the plan no longer covers what the room needs.
     */
    private getCorePlan(room: Room, spawn: StructureSpawn): CorePlan {
        const caps = {
            towers: CONTROLLER_STRUCTURES[STRUCTURE_TOWER][8] || 6,
            labs: CONTROLLER_STRUCTURES[STRUCTURE_LAB][8] || 10,
        };

        const cached = room.memory?.corePlan;
        if (cached && cached.spawnId === spawn.id) {
            const complete =
                cached.plan.storage !== undefined &&
                cached.plan.terminal !== undefined &&
                cached.plan.link !== undefined &&
                cached.plan.factory !== undefined &&
                cached.plan.observer !== undefined &&
                cached.plan.towers.length >= caps.towers &&
                cached.plan.labs.length >= caps.labs;
            if (complete || Game.time - cached.plannedAt < REPLAN_INTERVAL) return cached.plan;
        }

        const plan = CorePlanner.forRoom(room, spawn, caps, this.getSurvey(room));
        if (room.memory) {
            room.memory.corePlan = { spawnId: spawn.id, plannedAt: Game.time, plan };
        }
        Logger.info(
            `[Core] ${room.name}: storage ${describeTile(plan.storage)}, terminal ${describeTile(plan.terminal)}, ` +
                `link ${describeTile(plan.link)}, factory ${describeTile(plan.factory)}, ` +
                `observer ${describeTile(plan.observer)}, ${plan.towers.length} towers, ${plan.labs.length} labs`,
        );
        return plan;
    }

    private getSurvey(room: Room): RoomSurvey {
        if (this.survey && this.survey.tick === Game.time && this.survey.roomName === room.name) {
            return this.survey.data;
        }
        const data = surveyRoom(room);
        this.survey = { tick: Game.time, roomName: room.name, data };
        return data;
    }

    /** Planned tiles that either already hold an extension or could still take one. */
    private countUsablePlanTiles(room: Room, tiles: { x: number; y: number }[]): number {
        let usable = 0;
        for (const tile of tiles) {
            const pos = new RoomPosition(tile.x, tile.y, room.name);
            const hasExtension =
                pos.lookFor(LOOK_STRUCTURES).some(s => s.structureType === STRUCTURE_EXTENSION) ||
                pos.lookFor(LOOK_CONSTRUCTION_SITES).some(s => s.structureType === STRUCTURE_EXTENSION);
            if (hasExtension || ConstructionUtils.isTileClearForStructure(pos, room, true)) usable++;
        }
        return usable;
    }

    /**
     * Paves the walkways through the extension field, but only once the extensions around
     * them actually exist - roads cost upkeep and the field fills in gradually.
     */
    private planExtensionRoads(room: Room, plan: ExtensionPlan): void {
        let placed = 0;
        for (const tile of plan.roads) {
            if (placed >= EXTENSION_ROADS_PER_PASS) break;
            if (Object.keys(Game.constructionSites).length >= 100) break;

            const pos = new RoomPosition(tile.x, tile.y, room.name);
            if (!ConstructionUtils.isTileClearForStructure(pos, room)) continue;
            if (this.countAdjacentExtensions(room, tile) < EXTENSION_ROAD_ADJACENCY) continue;

            if (room.createConstructionSite(pos, STRUCTURE_ROAD) === OK) placed++;
        }
    }

    private countAdjacentExtensions(room: Room, tile: { x: number; y: number }): number {
        const offsets = [
            { x: 0, y: -1 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
        ];

        let count = 0;
        for (const offset of offsets) {
            const pos = new RoomPosition(tile.x + offset.x, tile.y + offset.y, room.name);
            const hasExtension =
                pos.lookFor(LOOK_STRUCTURES).some(s => s.structureType === STRUCTURE_EXTENSION) ||
                pos.lookFor(LOOK_CONSTRUCTION_SITES).some(s => s.structureType === STRUCTURE_EXTENSION);
            if (hasExtension) count++;
        }
        return count;
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

function describeTile(tile: Tile | undefined): string {
    return tile ? `${tile.x},${tile.y}` : "none";
}
