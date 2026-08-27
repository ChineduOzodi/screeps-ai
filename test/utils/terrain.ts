import { TerrainLike } from "../../src/utils/min-cut";
import { Tile } from "../../src/utils/room-grid";

export const WALL = 1;
const ROOM_SIZE = 50;

export const openTerrain: TerrainLike = { get: () => 0 };

export function key(tile: Tile): string {
    return `${tile.x},${tile.y}`;
}

/** Terrain built from an explicit wall set. */
export function terrainWithWalls(walls: Set<string>): TerrainLike {
    return { get: (x: number, y: number) => (walls.has(`${x},${y}`) ? WALL : 0) };
}

/** Terrain where everything is wall except the given open tiles. */
export function terrainWithOpen(open: Set<string>): TerrainLike {
    return { get: (x: number, y: number) => (open.has(`${x},${y}`) ? 0 : WALL) };
}

/** A vertical corridor `width` tiles wide, centred on x=25, running y=5..44. */
export function corridorTerrain(width: number): TerrainLike {
    const open = new Set<string>();
    const half = Math.floor(width / 2);
    for (let y = 5; y <= 44; y++) {
        for (let x = 25 - half; x <= 25 - half + width - 1; x++) open.add(`${x},${y}`);
    }
    return terrainWithOpen(open);
}

/**
 * Flood fill from the tiles around the anchor across everything that is neither terrain
 * wall nor a planned structure. Creeps move diagonally, so all 8 neighbours count.
 */
export function reachableFrom(terrain: TerrainLike, anchor: Tile, blockedTiles: Tile[]): Set<string> {
    const blocked = new Set(blockedTiles.map(key));
    const seen = new Set<string>();
    const queue: Tile[] = [];

    const push = (x: number, y: number): void => {
        if (x < 0 || x >= ROOM_SIZE || y < 0 || y >= ROOM_SIZE) return;
        const k = `${x},${y}`;
        if (seen.has(k) || blocked.has(k) || terrain.get(x, y) === WALL) return;
        seen.add(k);
        queue.push({ x, y });
    };

    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            push(anchor.x + dx, anchor.y + dy);
        }
    }

    while (queue.length > 0) {
        const tile = queue.pop() as Tile;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                push(tile.x + dx, tile.y + dy);
            }
        }
    }
    return seen;
}

/** True when a creep can stand on the tile or on one of its 8 neighbours. */
export function isServiced(reach: Set<string>, tile: Tile): boolean {
    if (reach.has(key(tile))) return true;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (reach.has(`${tile.x + dx},${tile.y + dy}`)) return true;
        }
    }
    return false;
}
