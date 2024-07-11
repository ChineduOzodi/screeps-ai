import { BaseSystemImpl } from "./base-system";
import { CreepConstants } from "../constants/creep-constants";
import { SpawningSystem } from "./spawning-system";

export class InfrastructureSystem extends BaseSystemImpl {

    public override get systemInfo(): ColonyInfrastructureManagement {
        if (!this.colony.colonyInfo.infrastructureManagement) {
            this.colony.colonyInfo.infrastructureManagement = {
                nextUpdate: 0
            };
        }
        return this.colony.colonyInfo.infrastructureManagement;
    }

    public override get energyUsageTracking(): EnergyUsageTracking {
        if (!this.systemInfo.energyUsageTracking) {
            this.systemInfo.energyUsageTracking = {
                actualEnergyUsagePercentage: 0,
                estimatedEnergyWorkRate: 0,
                requestedEnergyUsageWeight: 0.25,
                allowedEnergyWorkRate: 0
            };
        }
        return this.systemInfo.energyUsageTracking;
    }

    public override onStart(): void {}

    public override run(): void {
        this.manageRepairers();
    }

    public override onLevelUp(_level: number): void {}

    public override updateProfiles(): void {
        if (!this.systemInfo.repairers) {
            console.log(`${this.colony.colonyInfo.id} infrastructure-system | creating repairer profile`);
            this.systemInfo.repairers = this.createRepairerProfile();
        } else {
            this.systemInfo.repairers = this.updateRepairerProfile(this.systemInfo.repairers);
        }
    }

    public override getRolesToTrackEnergy(): string[] {
        return ["repairer"];
    }

    private manageRepairers(): void {
        if (!this.systemInfo.repairers) {
            throw new Error("systemInfo.repairers is null, cannot proceed with managing.");
        }
        SpawningSystem.run(this.colony, this.systemInfo.repairers);
    }

    private createRepairerProfile(): ColonyCreepSpawnManagement {
        const maxCreepCount = 1;
        const energyAvailable = this.room.energyCapacityAvailable;

        const creepBodyScale = Math.floor(
            energyAvailable /
                (CreepConstants.WORK_PART_COST + CreepConstants.CARRY_PART_COST + CreepConstants.MOVE_PART_COST)
        );
        const body = BaseSystemImpl.scaleCreepBody([WORK, CARRY, MOVE], creepBodyScale);

        const memory: AddCreepToQueueOptions = {
            workAmount: creepBodyScale,
            averageEnergyConsumptionProductionPerTick: creepBodyScale,
            workDuration: 2,
            role: "repairer"
        };
        const creepSpawnManagement: ColonyCreepSpawnManagement = {
            creepNames: [],
            desiredAmount: maxCreepCount,
            bodyBlueprint: body,
            memoryBlueprint: memory
        };

        return creepSpawnManagement;
    }

    private updateRepairerProfile(profile: ColonyCreepSpawnManagement): ColonyCreepSpawnManagement {
        console.log(`${this.colony.colonyInfo.id} infrastructure-system | updating repairer profile`);
        const newProfile = this.createRepairerProfile();
        newProfile.creepNames = profile.creepNames;
        return newProfile;
    }
}
