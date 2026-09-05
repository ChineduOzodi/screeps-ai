import { BaseSystemImpl } from "./base-system";
import { CreepRole } from "prototypes/types";
import { CreepSpawner } from "prototypes/CreepSpawner";
import { DefenderCreepSpawner } from "creep-roles/defender-creep";
import { HealerCreepSpawner } from "creep-roles/healer-creep";
import { RangedDefenderCreepSpawner } from "creep-roles/ranged-defender-creep";
import { RoomUtils } from "utils/room-utils";
import { alertedDefendedRooms } from "utils/defense-scope";

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
        const rooms = this.colony.colonyInfo.rooms;
        for (const roomName in rooms) {
            // Actively update room data if we have vision of the room
            if (Game.rooms[roomName]) {
                RoomUtils.updateRoomData(this.colony, Game.rooms[roomName]);
            }
        }

        // Only alerts in rooms the colony uses cost energy; the rest is intel.
        let threatLevel = 0;
        for (const roomInfo of alertedDefendedRooms(this.colony.colonyInfo)) {
            threatLevel += roomInfo.alertLevel;
        }

        if (threatLevel > 0) {
            this.energyUsageTracking.requestedEnergyUsageWeight = 10;
        } else {
            this.energyUsageTracking.requestedEnergyUsageWeight = 0;
        }
    }

    public override getCreepSpawners(): CreepSpawner[] {
        return [new DefenderCreepSpawner(), new RangedDefenderCreepSpawner(), new HealerCreepSpawner()];
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.DEFENDER, CreepRole.RANGED_DEFENDER, CreepRole.HEALER];
    }

    public override getStatus(): string | null {
        return alertedDefendedRooms(this.colony.colonyInfo).length > 0 ? "Defending Colony Area" : null;
    }
}
