import "./prototypes/memory.extensions";
import "./prototypes/colony.extensions";
import "./prototypes/creep.extensions";
import "./prototypes/spawn.extensions";
import "./prototypes/room.extensions";

import { ColonyManagerImpl } from "./prototypes/colony";
import { CreepManagement } from "management/creep-management";
import { ErrorMapper } from "utils/ErrorMapper";
import { RoomExtras } from "./prototypes/room";
import { SpawnExtras } from "prototypes/spawn";

// -------------------------------------

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
    // Automatically delete memory of missing creeps
    for (const name in Memory.creeps) {
        if (!(name in Game.creeps)) {
            delete Memory.creeps[name];
        }
    }

    if (!Memory.colonies) {
        Memory.colonies = {};
    }

    if (!Memory.pathfindingCache) {
        Memory.pathfindingCache = {};
    }

    // Automatically delete memory of rooms that are no longer tracked by any colony and we don't have vision of
    for (const roomName in Memory.rooms) {
        // Cleanup old construction system memory
        if ((Memory.rooms[roomName] as any).constructionProjects) {
            delete (Memory.rooms[roomName] as any).constructionProjects;
        }

        if (!(roomName in Game.rooms)) {
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

    for (const name in Memory.colonies) {
        const colonyData = Memory.colonies[name];
        if (!colonyData) {
            delete Memory.colonies[name];
            continue;
        }
        const colony = new ColonyManagerImpl(colonyData);
        colony.run();
    }

    for (const name in Game.spawns) {
        const spawn = new SpawnExtras(Game.spawns[name]);
        spawn.run();
    }

    for (const name in Game.creeps) {
        CreepManagement.run(Game.creeps[name]);
    }

    for (const name in Game.rooms) {
        const room = new RoomExtras(Game.rooms[name]);
        room.run();
    }

    // Periodic global reservation cleanup
    if (Game.time % 10 === 0) {
        for (const roomName in Memory.rooms) {
            const roomMemory = Memory.rooms[roomName];
            if (roomMemory.positionReservations) {
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
    }
});
