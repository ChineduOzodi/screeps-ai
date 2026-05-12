interface Memory {
    colonies: {
        [colonyId: string]: Colony | undefined;
    };
    pathfindingCache?: {
        [key: string]: {
            path: PathStep[];
            timestamp: number;
        };
    };
}
