/* eslint-disable no-bitwise */
/**
 * Minimum-cut based perimeter planner.
 *
 * Models the room as a flow network (exits = source side, protected area = sink side,
 * each buildable tile has capacity 1) and computes the max-flow / min-cut. The cut is
 * the smallest set of tiles that, when walled with ramparts, separates every exit from
 * the protected area.
 */

export interface TerrainLike {
    get(x: number, y: number): number;
}

export interface Rect {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

interface Edge {
    to: number;
    cap: number;
    /** Index of the reverse edge in graph[to]. */
    rev: number;
}

const ROOM_SIZE = 50;
const INF = 1 << 20;
/** Safety valve: a max-flow this large means the protected area leaks into an exit. */
const MAX_REASONABLE_FLOW = 500;

export class MinCut {
    /**
     * Computes the tiles to rampart so that the protected rectangles are sealed off
     * from all room exits. Returns an empty array when no finite cut exists (e.g. a
     * protected rect touches the exit border).
     */
    public static computeCut(
        terrain: TerrainLike,
        protectedRects: Rect[],
        terrainWallMask: number,
    ): { x: number; y: number }[] {
        const isWall = (x: number, y: number): boolean => (terrain.get(x, y) & terrainWallMask) !== 0;

        const inNode = (x: number, y: number) => (y * ROOM_SIZE + x) * 2;
        const outNode = (x: number, y: number) => (y * ROOM_SIZE + x) * 2 + 1;
        const SOURCE = ROOM_SIZE * ROOM_SIZE * 2;
        const SINK = SOURCE + 1;
        const nodeCount = SINK + 1;

        const graph: Edge[][] = new Array(nodeCount);
        for (let i = 0; i < nodeCount; i++) graph[i] = [];

        const addEdge = (from: number, to: number, cap: number) => {
            graph[from].push({ to, cap, rev: graph[to].length });
            graph[to].push({ to: from, cap: 0, rev: graph[from].length - 1 });
        };

        const inRect = (x: number, y: number): boolean =>
            protectedRects.some(r => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2);

        const isExit = (x: number, y: number): boolean =>
            (x === 0 || x === ROOM_SIZE - 1 || y === 0 || y === ROOM_SIZE - 1) && !isWall(x, y);

        const nearExit = (x: number, y: number): boolean => {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || nx >= ROOM_SIZE || ny < 0 || ny >= ROOM_SIZE) continue;
                    if (isExit(nx, ny)) return true;
                }
            }
            return false;
        };

        // If any protected tile is an exit or exit-adjacent, no finite cut exists.
        for (const r of protectedRects) {
            for (let x = r.x1; x <= r.x2; x++) {
                for (let y = r.y1; y <= r.y2; y++) {
                    if (!isWall(x, y) && (isExit(x, y) || nearExit(x, y))) {
                        return [];
                    }
                }
            }
        }

        // Build the graph
        for (let x = 0; x < ROOM_SIZE; x++) {
            for (let y = 0; y < ROOM_SIZE; y++) {
                if (isWall(x, y)) continue;

                // Tile capacity: 1 if a rampart here can block, INF if unbuildable/protected.
                let cap = 1;
                if (inRect(x, y)) cap = INF;
                else if (isExit(x, y) || nearExit(x, y)) cap = INF;

                addEdge(inNode(x, y), outNode(x, y), cap);

                // Source feeds exits, protected area drains to sink.
                if (isExit(x, y)) addEdge(SOURCE, inNode(x, y), INF);
                if (inRect(x, y)) addEdge(outNode(x, y), SINK, INF);

                // 8-directional movement edges
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx < 0 || nx >= ROOM_SIZE || ny < 0 || ny >= ROOM_SIZE) continue;
                        if (isWall(nx, ny)) continue;
                        addEdge(outNode(x, y), inNode(nx, ny), INF);
                    }
                }
            }
        }

        // Edmonds-Karp max flow
        let totalFlow = 0;
        for (;;) {
            const { parentEdge, parentNode } = MinCut.bfs(graph, SOURCE, SINK);
            if (parentNode[SINK] === -1) break;

            // Find bottleneck
            let bottleneck = INF;
            for (let v = SINK; v !== SOURCE; v = parentNode[v]) {
                const edge = graph[parentNode[v]][parentEdge[v]];
                bottleneck = Math.min(bottleneck, edge.cap);
            }

            // Augment
            for (let v = SINK; v !== SOURCE; v = parentNode[v]) {
                const edge = graph[parentNode[v]][parentEdge[v]];
                edge.cap -= bottleneck;
                graph[edge.to][edge.rev].cap += bottleneck;
            }

            totalFlow += bottleneck;
            if (totalFlow > MAX_REASONABLE_FLOW) {
                return []; // Room can't be sealed with a sensible number of ramparts
            }
        }

        if (totalFlow === 0) {
            return []; // Exits can't reach the protected area at all (or nothing to protect)
        }

        // Min cut: tiles whose in-node is reachable from SOURCE in the residual graph
        // but whose out-node is not.
        const reachable = MinCut.residualReachable(graph, SOURCE);
        const cut: { x: number; y: number }[] = [];
        for (let x = 0; x < ROOM_SIZE; x++) {
            for (let y = 0; y < ROOM_SIZE; y++) {
                if (isWall(x, y)) continue;
                if (reachable[inNode(x, y)] && !reachable[outNode(x, y)]) {
                    cut.push({ x, y });
                }
            }
        }
        return cut;
    }

    private static bfs(graph: Edge[][], source: number, sink: number): { parentEdge: number[]; parentNode: number[] } {
        const parentNode = new Array(graph.length).fill(-1);
        const parentEdge = new Array(graph.length).fill(-1);
        parentNode[source] = source;

        const queue: number[] = [source];
        let head = 0;
        while (head < queue.length) {
            const u = queue[head++];
            if (u === sink) break;
            const edges = graph[u];
            for (let i = 0; i < edges.length; i++) {
                const edge = edges[i];
                if (edge.cap > 0 && parentNode[edge.to] === -1) {
                    parentNode[edge.to] = u;
                    parentEdge[edge.to] = i;
                    queue.push(edge.to);
                }
            }
        }

        return { parentEdge, parentNode };
    }

    private static residualReachable(graph: Edge[][], source: number): boolean[] {
        const seen = new Array(graph.length).fill(false);
        seen[source] = true;
        const queue: number[] = [source];
        let head = 0;
        while (head < queue.length) {
            const u = queue[head++];
            for (const edge of graph[u]) {
                if (edge.cap > 0 && !seen[edge.to]) {
                    seen[edge.to] = true;
                    queue.push(edge.to);
                }
            }
        }
        return seen;
    }

    /**
     * Builds padded bounding rectangles around the positions worth protecting,
     * clamped away from the room border.
     */
    public static getProtectedRects(positions: { x: number; y: number }[], padding: number): Rect[] {
        if (positions.length === 0) return [];

        let minX = ROOM_SIZE;
        let minY = ROOM_SIZE;
        let maxX = 0;
        let maxY = 0;
        for (const pos of positions) {
            minX = Math.min(minX, pos.x);
            minY = Math.min(minY, pos.y);
            maxX = Math.max(maxX, pos.x);
            maxY = Math.max(maxY, pos.y);
        }

        const clamp = (v: number) => Math.max(3, Math.min(ROOM_SIZE - 4, v));
        return [
            {
                x1: clamp(minX - padding),
                y1: clamp(minY - padding),
                x2: clamp(maxX + padding),
                y2: clamp(maxY + padding),
            },
        ];
    }
}
