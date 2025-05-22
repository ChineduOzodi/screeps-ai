import { BaseSystemImpl } from "./base-system";
import { CreepRole } from "prototypes/creep";
import { CreepSpawner } from "prototypes/CreepSpawner";
import { HarvesterCreepSpawner } from "creep-roles/harvester-creep";

/**
 * Ensures that we are producing as much energy as we can from the selected rooms for a given colony.
 */
export class EnergySystem extends BaseSystemImpl {
    public override get systemInfo(): ColonyEnergyManagement {
        if (!this.colony.colonyInfo.energyManagement) {
            this.colony.colonyInfo.energyManagement = {
                nextUpdate: Game.time,
                sources: [],
                energyUsageModifier: 1,
                estimatedEnergyProductionRate: 0,
                totalEnergyUsagePercentageAllowed: 0,
                storedEnergyPercent: 0,
                creepSpawnersInfo: {},
            };
            this.setSources();
        }
        return this.colony.colonyInfo.energyManagement;
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

    public override onStart(): void {
        // Make sure system info is initiated
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        this.systemInfo;
    }

    private setSources() {
        const sources = this.colony.getMainRoom().find(FIND_SOURCES);
        this.systemInfo.sources = [];

        sources.forEach(source => {
            this.systemInfo.sources.push({
                accessCount: 1,
                sourceId: source.id,
                position: source.pos,
            });
        });
    }

    public override run(): void {}

    public override onLevelUp(_level: number): void {}

    public override getCreepSpawners(): CreepSpawner[] {
        return [new HarvesterCreepSpawner()];
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.HARVESTER];
    }

    public noEnergyCollectors(): boolean {
        return this.getRoleCount(CreepRole.HARVESTER) === 0 && this.getRoleCount(CreepRole.MINER) === 0;
    }
}
