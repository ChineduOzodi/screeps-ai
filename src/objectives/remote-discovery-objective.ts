import { Objective } from "./types";
import { ColonyManager, CreepRole } from "../prototypes/types";

export class RemoteDiscoveryObjective implements Objective {
    public name = "Remote Discovery";
    public priority = 90; // High priority to show status

    private colony: ColonyManager;

    constructor(colony: ColonyManager) {
        this.colony = colony;
    }

    public isReady(): boolean {
        const room = this.colony.getMainRoom();
        if (!room || !room.controller) return false;

        // RCL level requirement
        if (room.controller.level < 3) return false;

        // Storage or container prerequisite
        if (!this.colony.getPrimaryStorage()) return false;

        // Ready if we have rooms to scout
        return this.getRoomsToScout().length > 0;
    }

    public isComplete(): boolean {
        return this.getRoomsToScout().length === 0;
    }

    private getRoomsToScout(): string[] {
        const room = this.colony.getMainRoom();
        if (!room) return [];

        const adjacentRooms = Object.values(Game.map.describeExits(room.name));

        return adjacentRooms.filter(roomName => {
            const data = this.colony.colonyInfo.rooms[roomName];
            return !data || !Game.rooms[roomName] || Game.time - (data.lastScouted || 0) > 1000;
        });
    }

    public execute(): void {
        // Spawning is now handled by ScoutCreepSpawner in EnergySystem
    }
}
