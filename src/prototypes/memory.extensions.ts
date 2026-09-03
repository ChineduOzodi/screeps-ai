import { CpuStats } from "utils/cpu-budget";
import { SerializableRoomPosition } from "utils/pathfinding-cache";

declare global {
    interface Memory {
        debug?: boolean;
        colonies: {
            [colonyId: string]: Colony | undefined;
        };
        /** Written every tick by the CPU budget; read it from the console or the API. */
        stats?: { cpu?: CpuStats };
        settings?: {
            /** Set false to drop all RoomVisual output regardless of CPU. */
            visuals?: boolean;
            /** Spend a full bucket on a pixel (official server only). Off by default. */
            generatePixels?: boolean;
        };
        /** Legacy on-disk path cache; the cache now lives on the heap and this is deleted on sight. */
        pathfindingCache?: {
            [key: string]: {
                path: SerializableRoomPosition[];
                timestamp: number;
            };
        };
        /** Per room combat squad state, keyed by room name. */
        squads?: {
            [roomName: string]: SquadMemory;
        };
    }

    interface SquadMemory {
        /** True while the squad is committed to the fight rather than holding at its rally point. */
        engaged: boolean;
        /** Hostile the squad is focusing, so the choice survives between ticks. */
        focusTargetId?: string;
        /** Tick this squad was last built, used to expire stale entries. */
        updated: number;
    }
}
