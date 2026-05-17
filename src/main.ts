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
});
