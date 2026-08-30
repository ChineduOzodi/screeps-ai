import { SerializableRoomPosition } from "utils/pathfinding-cache";

declare global {
    interface Memory {
        debug?: boolean;
        colonies: {
            [colonyId: string]: Colony | undefined;
        };
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
