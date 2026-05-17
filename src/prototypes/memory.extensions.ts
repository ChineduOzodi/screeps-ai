import { SerializableRoomPosition } from "utils/pathfinding-cache";

declare global {
    interface Memory {
        colonies: {
            [colonyId: string]: Colony | undefined;
        };
        pathfindingCache?: {
            [key: string]: {
                path: SerializableRoomPosition[];
                timestamp: number;
            };
        };
    }
}
