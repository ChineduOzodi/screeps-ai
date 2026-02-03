import { ColonyManager } from "../prototypes/colony";

export interface ProjectStructure {
    x: number;
    y: number;
    roomName: string;
    type: StructureConstant;
}

export interface ConstructionProject {
    name: string;
    structures: ProjectStructure[];
    status: "planning" | "building" | "complete";
}

export interface RepairStats {
    totalNeeded: number;
    lastCheck: number;
}

export class ConstructionManager {
    private colony: ColonyManager;

    constructor(colony: ColonyManager) {
        this.colony = colony;
    }

    /**
     * Registers and starts building a project.
     * @param projectName Unique name for the project (e.g. "Extensions_Level_2")
     * @param structures List of structures to build
     */
    public buildProject(projectName: string, structures: ProjectStructure[]): void {
        const room = this.colony.getMainRoom();
        if (!room) return;

        // Ensure memory exists
        if (!room.memory.constructionProjects) {
            room.memory.constructionProjects = {};
        }

        const project = room.memory.constructionProjects[projectName];
        if (project) {
            // Project exists, update structure list if needed (merge?)
            // For now, we assume the new list is the source of truth if provided?
            // User said: "If the build function is called and the structure underneath already exists... it should just add that to the memory"
            // We'll just update the definition.
            project.structures = structures;
        } else {
            // New Project
            room.memory.constructionProjects[projectName] = {
                name: projectName,
                structures,
                status: "building",
            };
        }

        this.processProject(projectName);
    }

    /**
     * Checks if a project is fully built (all structures exist or are construction sites).
     */
    public isProjectComplete(projectName: string): boolean {
        const room = this.colony.getMainRoom();
        if (!room || !room.memory.constructionProjects) return false;

        const project = room.memory.constructionProjects[projectName];
        if (!project) return false;

        // Check verification
        let allGood = true;
        for (const s of project.structures) {
            if (!this.structureExistsOrIsSite(s)) {
                allGood = false;
                break;
            }
        }
        return allGood;
    }

    public run(): void {
        const room = this.colony.getMainRoom();
        if (!room || !room.memory.constructionProjects) return;

        // Maintenance: Check 1 random structure from 1 random project
        const projectNames = Object.keys(room.memory.constructionProjects);
        if (projectNames.length === 0) return;

        const randomProjectName = projectNames[Math.floor(Math.random() * projectNames.length)];
        const project = room.memory.constructionProjects[randomProjectName];

        if (project && project.structures.length > 0) {
            const randomStructure = project.structures[Math.floor(Math.random() * project.structures.length)];
            this.checkAndEnforceStructure(randomStructure);
        }
    }

    private processProject(projectName: string): void {
        const room = this.colony.getMainRoom();
        if (!room || !room.memory.constructionProjects) return;
        const project = room.memory.constructionProjects[projectName];
        if (!project) return;

        for (const s of project.structures) {
            this.createSiteIfNeeded(s);
        }
    }

    private checkAndEnforceStructure(s: ProjectStructure): void {
        // "If the structure is not there, it should only add it to the build queue if it is in a room we control or have reserved. If neither, delete structure from memory."
        // Deleting from memory implies removing it from the project definition.

        if (this.structureExists(s)) {
            return;
        }

        // Structure missing. Check room visibility and control.
        const room = Game.rooms[s.roomName];
        if (!room) {
            // Cannot see room. Do nothing until we have vision.
            return;
        }

        // We have vision, and structure is missing.
        // Check for ownership or reservation.
        const isMyRoom = room.controller?.my;
        const isReserved = room.controller?.reservation && room.controller.reservation.username === "ChineduOzodi";

        const isMine = isMyRoom || isReserved;

        if (isMine) {
            // Rebuild
            this.createSiteIfNeeded(s);
        } else {
            // "Delete that structure from memory"
            // This requires removing it from the project definition.
            const roomMem = this.colony.getMainRoom().memory;
            if (roomMem && roomMem.constructionProjects) {
                for (const pName in roomMem.constructionProjects) {
                    const p = roomMem.constructionProjects[pName];
                    const index = p.structures.findIndex(st => st.x === s.x && st.y === s.y && st.type === s.type);
                    if (index > -1) {
                        p.structures.splice(index, 1);
                        console.log(
                            `ConstructionManager: Removed structure at ${s.x},${s.y} ${s.roomName} from project ${pName} - Room lost.`,
                        );
                    }
                }
            }
        }
    }

    private createSiteIfNeeded(s: ProjectStructure): void {
        const room = Game.rooms[s.roomName];
        if (!room) return; // No vision

        // Check if structure exists
        const pos = new RoomPosition(s.x, s.y, s.roomName);
        const structure = pos.lookFor(LOOK_STRUCTURES).find(st => st.structureType === s.type);
        if (structure) return; // Exists

        // Check if site exists
        const site = pos.lookFor(LOOK_CONSTRUCTION_SITES).find(st => st.structureType === s.type);
        if (site) return; // Site exists

        // Create site
        const result = room.createConstructionSite(pos, s.type);
        if (result === OK) {
            // ok
        } else {
            // log error?
        }
    }

    private structureExists(s: ProjectStructure): boolean {
        const room = Game.rooms[s.roomName];
        if (!room) return true; // Assume exists if no vision to avoid spam/deletion?
        // Actually better to return false if we have vision and it's not there.
        // If no vision, we can't check.

        const pos = new RoomPosition(s.x, s.y, s.roomName);
        const structure = pos.lookFor(LOOK_STRUCTURES).find(st => st.structureType === s.type);
        return !!structure;
    }

    private structureExistsOrIsSite(s: ProjectStructure): boolean {
        const room = Game.rooms[s.roomName];
        if (!room) return false; // Cant verify

        const pos = new RoomPosition(s.x, s.y, s.roomName);
        const structure = pos.lookFor(LOOK_STRUCTURES).find(st => st.structureType === s.type);
        if (structure) return true;

        const site = pos.lookFor(LOOK_CONSTRUCTION_SITES).find(st => st.structureType === s.type);
        return !!site;
    }
    public getRepairStats(): RepairStats {
        const room = this.colony.getMainRoom();
        if (!room) {
            return { totalNeeded: 0, lastCheck: Game.time };
        }

        if (!room.memory.repairStats) {
            room.memory.repairStats = {
                totalNeeded: 0,
                lastCheck: 0,
            };
        }

        const stats = room.memory.repairStats;
        if (Game.time - stats.lastCheck > 50) {
            const targets = room.find(FIND_STRUCTURES, {
                filter: object => object.hits < object.hitsMax,
            });

            let totalNeeded = 0;
            for (const target of targets) {
                totalNeeded += target.hitsMax - target.hits;
            }

            stats.totalNeeded = totalNeeded;
            stats.lastCheck = Game.time;
        }

        return stats;
    }
}
