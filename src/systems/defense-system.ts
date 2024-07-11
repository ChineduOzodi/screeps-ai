import { SpawningSystem } from "./spawning-system";
import { BaseSystemImpl } from "./base-system";

export class DefenseSystem extends BaseSystemImpl {
    public override get systemInfo(): ColonyBaseSystemInfo {
        if (!this.colony.colonyInfo.defenseManagement) {
            this.colony.colonyInfo.defenseManagement = {
                nextUpdate: Game.time
            }
        }
        return this.colony.colonyInfo.defenseManagement;
    }

    public override get energyUsageTracking(): EnergyUsageTracking {
        if (!this.systemInfo.energyUsageTracking) {
            this.systemInfo.energyUsageTracking = {
                actualEnergyUsagePercentage: 0,
                estimatedEnergyWorkRate: 0,
                requestedEnergyUsageWeight: 0,
                allowedEnergyWorkRate: 0
            };
        }
        return this.systemInfo.energyUsageTracking;
    }

    public override onStart(): void {}

    public override run(): void {
        this.manageDefenders();
    }

    public override onLevelUp(_level: number): void {}

    public override updateProfiles(): void {
        const rooms = this.colony.colonyInfo.rooms;
        for (const room of rooms) {
            room.defenders = this.createDefenderProfile(room.name);
        }
    }

    public manageDefenders(): void {
        const colony = this.colony;
        const rooms = colony.colonyInfo.rooms;

        for (const room of rooms) {
            if (!room.defenders) {
                room.defenders = this.createDefenderProfile(room.name);
            }

            const gameRoom = Game.rooms[room.name];
            if (gameRoom) {
                room.alertLevel = gameRoom.find(FIND_HOSTILE_CREEPS).length;
            }

            if (room.alertLevel > 0) {
                room.defenders.desiredAmount = room.alertLevel + 1;
            }

            SpawningSystem.run(colony, room.defenders);
        }
    }

    public createDefenderProfile(roomName: string): ColonyCreepSpawnManagement {
        const body: BodyPartConstant[] = [];

        const room = this.colony.getMainRoom();
        const energy = room.energyCapacityAvailable;

        const numberOfParts = Math.max(
            1,
            Math.floor(energy / (BODYPART_COST.attack + BODYPART_COST.move + BODYPART_COST.tough))
        );

        for (let i = 0; i < numberOfParts; i++) {
            body.push(TOUGH);
            body.push(MOVE);
            body.push(ATTACK);
        }

        const energyUsePerTick = 0;

        const memory: AddCreepToQueueOptions = {
            homeRoomName: roomName,
            workDuration: 5,
            role: "defender",
            averageEnergyConsumptionProductionPerTick: energyUsePerTick
        };
        const creepSpawnManagement: ColonyCreepSpawnManagement = {
            creepNames: [],
            desiredAmount: 0,
            bodyBlueprint: body,
            memoryBlueprint: memory,
            important: true
        };

        return creepSpawnManagement;
    }

    public override getRolesToTrackEnergy(): string[] {
        return ["defender"];
    }
}
