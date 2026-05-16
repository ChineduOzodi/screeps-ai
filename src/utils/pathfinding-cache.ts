export interface CachedPath {
    path: PathStep[];
    timestamp: number;
}

export class PathfindingCache {
    private static readonly TTL = 1000;
    private static readonly CLEANUP_INTERVAL = 100;

    /**
     * Get a path from the cache.
     */
    public static getPath(
        from: RoomPosition,
        to: RoomPosition,
        range: number,
        options?: FindPathOpts,
        ttl: number = this.TTL,
    ): PathStep[] | undefined {
        if (!Memory.pathfindingCache) return undefined;

        const key = this.getCacheKey(from, to, range, options);
        const cached = Memory.pathfindingCache[key];
        if (cached && Game.time - cached.timestamp < ttl) {
            return cached.path;
        }

        // Try to find a reverse path if range is 0 and it's a standard pathfinding
        if (range === 0 && (!options || (!options.costCallback && options.ignoreCreeps !== false))) {
            const reverseKey = this.getCacheKey(to, from, 0, options);
            const reverseCached = Memory.pathfindingCache[reverseKey];
            if (reverseCached && Game.time - reverseCached.timestamp < ttl) {
                return this.reversePath(reverseCached.path, to);
            }
        }

        return undefined;
    }

    /**
     * Store a path in the cache.
     */
    public static setPath(
        from: RoomPosition,
        to: RoomPosition,
        range: number,
        path: PathStep[],
        options?: FindPathOpts,
    ): void {
        if (!Memory.pathfindingCache) {
            Memory.pathfindingCache = {};
        }

        const key = this.getCacheKey(from, to, range, options);
        Memory.pathfindingCache[key] = { path, timestamp: Game.time };

        // Periodically cleanup
        if (Game.time % this.CLEANUP_INTERVAL === 0) {
            this.cleanup();
        }
    }

    /**
     * Helper to find a path using the cache.
     */
    public static findPath(
        from: RoomPosition,
        to: RoomPosition | _HasRoomPosition,
        options: FindPathOpts & { favorExistingRoads?: boolean } = {},
    ): PathStep[] {
        const targetPos = (to as any).pos || (to as RoomPosition);
        const range = options.range || 0;

        // Don't cache if there's a costCallback (unless we want to support it later)
        // EXCEPT if favorExistingRoads is true, we have a standard callback
        if (options.costCallback && !options.favorExistingRoads) {
            return from.findPathTo(to, options);
        }

        const cached = this.getPath(from, targetPos, range, options);
        if (cached) return cached;

        const path = from.findPathTo(to, options);
        this.setPath(from, targetPos, range, path, options);
        return path;
    }

    /**
     * Clear the cache.
     */
    public static clear(): void {
        Memory.pathfindingCache = {};
    }

    /**
     * Remove expired entries from the cache.
     */
    public static cleanup(): void {
        if (!Memory.pathfindingCache) return;
        const keys = Object.keys(Memory.pathfindingCache);
        for (const key of keys) {
            // Remove anything older than TTL ticks to save memory
            if (Game.time - Memory.pathfindingCache[key].timestamp > this.TTL) {
                delete Memory.pathfindingCache[key];
            }
        }
    }

    private static getCacheKey(
        from: RoomPosition,
        to: RoomPosition,
        range: number,
        options?: FindPathOpts & { favorExistingRoads?: boolean },
    ): string {
        let key = `${from.roomName}:${from.x},${from.y}_${to.roomName}:${to.x},${to.y}_r${range}`;
        if (options) {
            if (options.ignoreCreeps) key += "_ic";
            if (options.ignoreDestructibleStructures) key += "_ids";
            if (options.swampCost) key += `_sc${options.swampCost}`;
            if (options.plainCost) key += `_pc${options.plainCost}`;
            if (options.favorExistingRoads) key += "_fer";
        }
        return key;
    }

    private static reversePath(path: PathStep[], target: RoomPosition): PathStep[] {
        if (path.length === 0) return [];

        const reversed: PathStep[] = [];
        for (let i = path.length - 1; i >= 0; i--) {
            const currentStep = path[i];

            let targetX;
            let targetY;
            if (i === 0) {
                targetX = target.x;
                targetY = target.y;
            } else {
                targetX = path[i - 1].x;
                targetY = path[i - 1].y;
            }

            const originX = currentStep.x;
            const originY = currentStep.y;

            const dx = targetX - originX;
            const dy = targetY - originY;
            const direction = this.getDirection(dx, dy);

            reversed.push({
                x: targetX,
                y: targetY,
                dx,
                dy,
                direction,
            });
        }

        return reversed;
    }

    private static getDirection(dx: number, dy: number): DirectionConstant {
        if (dx === 0 && dy === -1) return TOP;
        if (dx === 1 && dy === -1) return TOP_RIGHT;
        if (dx === 1 && dy === 0) return RIGHT;
        if (dx === 1 && dy === 1) return BOTTOM_RIGHT;
        if (dx === 0 && dy === 1) return BOTTOM;
        if (dx === -1 && dy === 1) return BOTTOM_LEFT;
        if (dx === -1 && dy === 0) return LEFT;
        if (dx === -1 && dy === -1) return TOP_LEFT;
        return TOP; // Fallback
    }
}
