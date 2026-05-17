export interface SerializableRoomPosition {
    x: number;
    y: number;
    roomName: string;
}

export interface CachedPath {
    path: SerializableRoomPosition[];
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
        options?: any,
        ttl: number = this.TTL,
    ): RoomPosition[] | undefined {
        if (!Memory.pathfindingCache) return undefined;

        const key = this.getCacheKey(from, to, range, options);
        const cached = Memory.pathfindingCache[key];
        if (cached && Game.time - cached.timestamp < ttl) {
            // Safety check for stale data (old PathStep format)
            if (cached.path.length > 0 && typeof cached.path[0].roomName === "undefined") {
                delete Memory.pathfindingCache[key];
                return undefined;
            }
            return cached.path.map(p => new RoomPosition(p.x, p.y, p.roomName));
        }

        // Try to find a reverse path if range is 0 and it's a standard pathfinding
        if (range === 0 && (!options || (!options.roomCallback && !options.costCallback && options.ignoreCreeps !== false))) {
            const reverseKey = this.getCacheKey(to, from, 0, options);
            const reverseCached = Memory.pathfindingCache[reverseKey];
            if (reverseCached && Game.time - reverseCached.timestamp < ttl) {
                // Safety check for stale data
                if (reverseCached.path.length > 0 && typeof reverseCached.path[0].roomName === "undefined") {
                    delete Memory.pathfindingCache[reverseKey];
                    return undefined;
                }
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
        path: RoomPosition[],
        options?: any,
    ): void {
        if (!Memory.pathfindingCache) {
            Memory.pathfindingCache = {};
        }

        const key = this.getCacheKey(from, to, range, options);
        Memory.pathfindingCache[key] = {
            path: path.map(p => ({ x: p.x, y: p.y, roomName: p.roomName })),
            timestamp: Game.time,
        };

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
        options: (FindPathOpts | PathFinderOpts) & { favorExistingRoads?: boolean; range?: number } = {},
    ): RoomPosition[] {
        const targetPos = (to as any).pos || (to as RoomPosition);
        const range = (options as any).range || 0;

        // Use custom callback if provided and not just "favorExistingRoads"
        if ((options as any).costCallback || ((options as any).roomCallback && !options.favorExistingRoads)) {
            // Fallback to room.findPathTo if it's single room FindPathOpts
            if (from.roomName === targetPos.roomName && (options as any).costCallback) {
                const pathSteps = from.findPathTo(targetPos, options as FindPathOpts);
                return pathSteps.map(s => new RoomPosition(s.x, s.y, from.roomName));
            }
            // Otherwise use PathFinder.search
            const result = PathFinder.search(from, { pos: targetPos, range }, options as PathFinderOpts);
            return result.path;
        }

        const cached = this.getPath(from, targetPos, range, options);
        if (cached) return cached;

        // Implement default multi-room pathfinding with PathFinder.search
        const searchOptions: PathFinderOpts = {
            plainCost: (options as any).plainCost || 2,
            swampCost: (options as any).swampCost || 10,
            roomCallback: (roomName: string) => {
                const room = Game.rooms[roomName];
                if (!room) return new PathFinder.CostMatrix();

                const costs = new PathFinder.CostMatrix();

                // Add roads
                room.find(FIND_STRUCTURES).forEach(struct => {
                    if (struct.structureType === STRUCTURE_ROAD) {
                        costs.set(struct.pos.x, struct.pos.y, 1);
                    } else if (
                        struct.structureType !== STRUCTURE_CONTAINER &&
                        (struct.structureType !== STRUCTURE_RAMPART || !(struct as StructureRampart).my)
                    ) {
                        costs.set(struct.pos.x, struct.pos.y, 0xff);
                    }
                });

                // Avoid construction sites (except roads, but only if planning roads - handled by favorExistingRoads)
                room.find(FIND_CONSTRUCTION_SITES).forEach(site => {
                    if (site.structureType !== STRUCTURE_ROAD) {
                        costs.set(site.pos.x, site.pos.y, 0xff);
                    }
                });

                return costs;
            },
        };

        const result = PathFinder.search(from, { pos: targetPos, range }, searchOptions);
        const path = result.path;
        
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
        options?: any,
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

    private static reversePath(path: SerializableRoomPosition[], origin: RoomPosition): RoomPosition[] {
        if (path.length === 0) return [];

        const reversed: RoomPosition[] = [];
        // Original path is from A to B: [P1, P2, ..., B]
        // We are at B going to A.
        // Sequence: A, P1, P2, ..., B
        // Reverse Sequence: B, ..., P2, P1, A
        // Reverse Path: [..., P2, P1, A]

        for (let i = path.length - 2; i >= 0; i--) {
            const p = path[i];
            reversed.push(new RoomPosition(p.x, p.y, p.roomName));
        }
        reversed.push(new RoomPosition(origin.x, origin.y, origin.roomName));

        return reversed;
    }
}
