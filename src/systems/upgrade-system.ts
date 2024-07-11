import { SpawningSystem } from "./spawning-system";
import { BaseSystemImpl } from "./base-system";

export class UpgradeSystem extends BaseSystemImpl {
    public override get systemInfo(): ColonyUpgradeManagement  {
        if (!this.colony.colonyInfo.upgradeManagement) {
            this.colony.colonyInfo.upgradeManagement = {
                nextUpdate: Game.time,
                energyUsageTracking: {
                    actualEnergyUsagePercentage: 0,
                    estimatedEnergyWorkRate: 0,
                    requestedEnergyUsageWeight: 0.5,
                    allowedEnergyWorkRate: 0
                }
            }
        }
        return this.colony.colonyInfo.upgradeManagement;
    }

    public override get energyUsageTracking(): EnergyUsageTracking {
        if (!this.systemInfo.energyUsageTracking) {
            this.systemInfo.energyUsageTracking = {
                actualEnergyUsagePercentage: 0,
                estimatedEnergyWorkRate: 0,
                requestedEnergyUsageWeight: 0.5,
                allowedEnergyWorkRate: 0
            }
        }
        return this.systemInfo.energyUsageTracking;
    }

    public override onStart(): void {}

    public override run(): void {
        this.manageUpgraders();
    }
    public override onLevelUp(_level: number): void {}

    public override updateProfiles(): void {
        // TODO: scale upgraders
    }

    public override getRolesToTrackEnergy(): string[] {
        return ["upgrader"];
    }

    public manageUpgraders(): void {
        const colony = this.colony;
        if (!this.systemInfo.upgraders) {
            this.systemInfo.upgraders = this.createUpgraderProfile();
        }

        const { upgraders } = this.systemInfo;

        const energyUsagePerCreep = -colony.getTotalEstimatedEnergyFlowRate("upgrader");
        if (energyUsagePerCreep <= 0) {
            upgraders.desiredAmount = 1;
        } else {
            upgraders.desiredAmount = Math.max(1, Math.floor(this.energyUsageTracking.allowedEnergyWorkRate / energyUsagePerCreep));
        }

        SpawningSystem.run(colony, this.systemInfo.upgraders);
    }

    public createUpgraderProfile(): ColonyCreepSpawnManagement {
        const colony = this.colony;
        const body: BodyPartConstant[] = [];

        body.push(WORK);
        body.push(CARRY);
        body.push(CARRY);
        body.push(MOVE);
        body.push(MOVE);

        const energyUsePerTick = UPGRADE_CONTROLLER_POWER * 1;

        const memory: AddCreepToQueueOptions = {
            workTargetId: colony.getMainRoom().controller?.id,
            workDuration: (CARRY_CAPACITY * 2) / energyUsePerTick,
            averageEnergyConsumptionProductionPerTick: energyUsePerTick,
            role: "upgrader"
        };

        const creepSpawnManagement: ColonyCreepSpawnManagement = {
            creepNames: [],
            desiredAmount: 1,
            bodyBlueprint: body,
            memoryBlueprint: memory
        };

        return creepSpawnManagement;
    }
}
