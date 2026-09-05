import "./prototypes/memory.extensions";
import "./prototypes/colony.extensions";
import "./prototypes/creep.extensions";
import "./prototypes/spawn.extensions";
import "./prototypes/room.extensions";

import { ColonyRegistry } from "./prototypes/colony-registry";
import { CpuBudget } from "utils/cpu-budget";
import { CreepManagement } from "management/creep-management";
import { CreepRole } from "prototypes/types";
import { Movement } from "infrastructure/movement";
import { ErrorMapper } from "utils/ErrorMapper";
import { RoomExtras } from "./prototypes/room";
import { RoomOverlay } from "./visuals/room-overlay";
import { SpawnExtras } from "prototypes/spawn";
import { SquadCoordinator } from "utils/squad-coordinator";
import Profiler from "screeps-profiler";

// -------------------------------------
Profiler.enable();

/**
 * Roles whose logic can wait a tick when CPU runs short. They keep following any path
 * they already have, so a skipped tick costs them a little progress, not a stall.
 */
const DEFERRABLE_ROLES = new Set<string>([
    CreepRole.UPGRADER,
    CreepRole.BUILDER,
    CreepRole.REPAIRER,
    CreepRole.SCOUT,
    CreepRole.MINERAL_MINER,
    CreepRole.LAB_HAULER,
    CreepRole.RESERVER,
]);

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
    Profiler.wrap(() => {
        CpuBudget.startTick();

        CpuBudget.measure("memory", () => {
            // Automatically delete memory of missing creeps
            for (const name in Memory.creeps) {
                if (!(name in Game.creeps)) {
                    delete Memory.creeps[name];
                }
            }

            if (!Memory.colonies) {
                Memory.colonies = {};
            }

            // The path cache lives on the heap now; the old copy in Memory only cost parse time.
            if (Memory.pathfindingCache) {
                delete Memory.pathfindingCache;
            }

            if (CpuBudget.every(100)) {
                cleanupRoomMemory();
            }
        });

        CpuBudget.measure("colonies", () => {
            for (const name in Memory.colonies) {
                if (!Memory.colonies[name]) {
                    delete Memory.colonies[name];
                    continue;
                }
                const colony = ColonyRegistry.get(name);
                if (colony) colony.run();
            }
        });

        CpuBudget.measure("spawns", () => {
            for (const name in Game.spawns) {
                const spawn = new SpawnExtras(Game.spawns[name]);
                spawn.run();
            }
        });

        CpuBudget.measure("creeps", runCreeps);

        CpuBudget.measure("rooms", () => {
            for (const name in Game.rooms) {
                const room = new RoomExtras(Game.rooms[name]);
                room.run();
            }
            // What the AI thinks about every remembered room, on the world map.
            if (CpuBudget.optionalAllowed()) {
                RoomOverlay.drawMap();
            }
        });

        // Periodic global reservation cleanup
        if (CpuBudget.every(10)) {
            CpuBudget.measure("cleanup", () => {
                SquadCoordinator.cleanup();
                cleanupReservations();
            });
        }

        CpuBudget.endTick();
    });
});

/** Essential creeps always run; the rest run in rotation while the budget lasts. */
function runCreeps(): void {
    const essential: Creep[] = [];
    const deferrable: Creep[] = [];
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        (DEFERRABLE_ROLES.has(creep.memory.role) ? deferrable : essential).push(creep);
    }

    for (const creep of essential) {
        CreepManagement.run(creep);
    }

    // Rotate the starting point so the same creeps aren't the ones starved every tick.
    const offset = deferrable.length > 0 ? Game.time % deferrable.length : 0;
    for (let i = 0; i < deferrable.length; i++) {
        const creep = deferrable[(i + offset) % deferrable.length];
        if (CpuBudget.canRunDeferrable()) {
            CreepManagement.run(creep);
        } else if (!creep.spawning) {
            CpuBudget.noteDeferredCreep();
            Movement.run(creep);
        }
    }
}

/** Drops memory of rooms no colony tracks and we can't see. */
function cleanupRoomMemory(): void {
    for (const roomName in Memory.rooms) {
        // Cleanup old construction system memory
        if ((Memory.rooms[roomName] as any).constructionProjects) {
            delete (Memory.rooms[roomName] as any).constructionProjects;
        }

        if (roomName in Game.rooms) continue;

        let isTracked = false;
        for (const colonyId in Memory.colonies) {
            const colony = Memory.colonies[colonyId];
            if (colony && colony.rooms) {
                if (Array.isArray(colony.rooms)) {
                    if ((colony.rooms as any[]).some(r => r.name === roomName)) {
                        isTracked = true;
                        break;
                    }
                } else if (colony.rooms[roomName]) {
                    isTracked = true;
                    break;
                }
            }
        }
        if (!isTracked) {
            delete Memory.rooms[roomName];
        }
    }
}

function cleanupReservations(): void {
    for (const roomName in Memory.rooms) {
        const roomMemory = Memory.rooms[roomName];
        if (!roomMemory.positionReservations) continue;
        for (const posKey in roomMemory.positionReservations) {
            const entry = roomMemory.positionReservations[posKey];
            for (let i = entry.reservations.length - 1; i >= 0; i--) {
                const res = entry.reservations[i];
                if (res.endTime < Game.time || !Game.creeps[res.creepName]) {
                    entry.reservations.splice(i, 1);
                }
            }
            if (entry.reservations.length === 0) {
                delete roomMemory.positionReservations[posKey];
            }
        }
    }
}
