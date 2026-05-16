import { RAMPART_TARGET_HPS, STORAGE_TARGETS, WALL_TARGET_HPS } from "constants/repair-constants";

export class RepairUtils {
    public static getStructureTargetHits(structure: AnyStructure, rcl: number): number {
        if (structure.structureType === STRUCTURE_WALL) {
            return WALL_TARGET_HPS[rcl] || 0;
        }
        if (structure.structureType === STRUCTURE_RAMPART) {
            return RAMPART_TARGET_HPS[rcl] || 0;
        }
        return structure.hitsMax;
    }

    public static getStorageTarget(rcl: number): number {
        return STORAGE_TARGETS[rcl] || 0;
    }

    /**
     * Calculates the energy per tick needed to counteract decay in the room.
     */
    public static calculateMaintenanceNeed(room: Room): number {
        const structures = room.find(FIND_STRUCTURES);
        let hitsPer100Ticks = 0;

        for (const s of structures) {
            switch (s.structureType) {
                case STRUCTURE_ROAD:
                    // Roads decay 100 hits every 100 ticks on plains, 500 on swamp
                    // Simplification: assume 200 avg
                    hitsPer100Ticks += 100; // Basic decay
                    break;
                case STRUCTURE_CONTAINER:
                    // Containers decay 5000 hits every 100 ticks (unowned room) or 100 hits (owned room)
                    // We only care about owned rooms for this calc usually
                    hitsPer100Ticks += 100;
                    break;
                case STRUCTURE_RAMPART:
                    // Ramparts decay 300 hits every 100 ticks
                    hitsPer100Ticks += 300;
                    break;
            }
        }

        // Energy per hit is 1 energy = 100 hits for repair()
        // (hits / 100) / 100 = energy per tick
        return hitsPer100Ticks / 10000;
    }
}
