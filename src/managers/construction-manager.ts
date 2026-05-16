import { ColonyManager } from "../prototypes/types";

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
            this.createSiteIfNeeded(s);
        }
    }

    public run(): void {
        const room = this.colony.getMainRoom();
        if (!room) return;

        // Rebuild ruins we "own" (or are in our controlled/reserved rooms), except roads.
        if (Game.time % 10 === 0) {
            this.rebuildRuins();
        }
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
            return { totalNeeded: 0, lastCheck: Game.time };
        }

        if (!room.memory.repairStats) {
            room.memory.repairStats = {
                totalNeeded: 0,
                lastCheck: 0,
            };
        }

        const stats = room.memory.repairStats;
        if (Game.time - stats.lastCheck > 50) {
            const targets = room.find(FIND_STRUCTURES, {
                filter: object => object.hits < object.hitsMax,
            });

            let totalNeeded = 0;
            for (const target of targets) {
                totalNeeded += target.hitsMax - target.hits;
            }

            stats.totalNeeded = totalNeeded;
            stats.lastCheck = Game.time;
        }

        return stats;
    }
}
