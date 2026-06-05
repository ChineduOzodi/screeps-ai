import { BaseSystemImpl } from "./base-system";
import { CreepRole } from "prototypes/types";
import { CreepSpawner } from "prototypes/CreepSpawner";
import { DefenderCreepSpawner } from "creep-roles/defender-creep";
import { HealerCreepSpawner } from "creep-roles/healer-creep";
import { RoomUtils } from "utils/room-utils";

export class DefenseSystem extends BaseSystemImpl {
    public override get systemInfo(): BaseSystemInfo {
        if (!this.colony.colonyInfo.defenseManagement) {
            this.colony.colonyInfo.defenseManagement = {
                nextUpdate: Game.time,
            };
        }
        return this.colony.colonyInfo.defenseManagement;
    }

    public override get energyUsageTracking(): EnergyUsageTracking {
        if (!this.systemInfo.energyUsageTracking) {
            this.systemInfo.energyUsageTracking = {
                actualEnergyUsagePercentage: 0,
                estimatedEnergyWorkRate: 0,
                requestedEnergyUsageWeight: 0,
                allowedEnergyWorkRate: 0,
            };
        }
        return this.systemInfo.energyUsageTracking;
    }

    public override onStart(): void {}

    public constructor(colony: any) {
        super(colony);
    }

    public override run(): void {
        super.run();
        let threatLevel = 0;
        const rooms = this.colony.colonyInfo.rooms;
        for (const roomName in rooms) {
            // Actively update room data if we have vision of the room
            if (Game.rooms[roomName]) {
                RoomUtils.updateRoomData(this.colony, Game.rooms[roomName]);
            }

            const roomInfo = rooms[roomName];
            if (roomInfo.alertLevel > 0) {
                threatLevel += roomInfo.alertLevel;
            }
        }

        if (threatLevel > 0) {
            this.energyUsageTracking.requestedEnergyUsageWeight = 10;
        } else {
            this.energyUsageTracking.requestedEnergyUsageWeight = 0;
        }
    }

    public override getCreepSpawners(): CreepSpawner[] {
        return [new DefenderCreepSpawner(), new HealerCreepSpawner()];
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.DEFENDER, CreepRole.HEALER];
    }

    public override getStatus(): string | null {
        const rooms = this.colony.colonyInfo.rooms;
        for (const roomName in rooms) {
            if (rooms[roomName].alertLevel > 0) {
                return "Defending Colony Area";
            }
        }
        return null;
    }
}
