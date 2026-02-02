import { ColonyManager } from "prototypes/colony";
import { CreepRole } from "prototypes/creep";
import { CreepSpawner } from "prototypes/CreepSpawner";

export interface BaseSystem {
    /** Reference to the system data that lives in screeps. */
    get systemInfo(): BaseSystemInfo;

    /** Reference to the energy usage tracking data that lives in screeps. */
    get energyUsageTracking(): EnergyUsageTracking;

    /** What happens when an new colony is started. */
    onStart(): void;

    run(): void;

    /** Functionality to update profiles of creeps to be spawned by the spawning system. Primarily invoked by colony manager. */
    updateProfiles(): void;

    /** Get Roles to track energy */
    getRolesToTrackEnergy(): CreepRole[];

    getSpawnerProfilesList(): CreepSpawnerProfileInfo[];

    /**
     * Returns the number of creeps that are alive with chosen role for this system.
     * @param role role to count.
     */
    getRoleCount(role: CreepRole): number;

    getGoapGoals(state: any): any[];

    getGoapActions(): any[];
}

export abstract class BaseSystemImpl implements BaseSystem {
    public abstract get systemInfo(): BaseSystemInfo;
    public abstract get energyUsageTracking(): EnergyUsageTracking;

    protected colony: ColonyManager;
    protected defaultEnergyWeight: number = 0;

    public constructor(colony: ColonyManager) {
        this.colony = colony;
    }

    public setEnergyBudgetWeight(weight: number): void {
        this.energyUsageTracking.requestedEnergyUsageWeight = weight;
    }

    public getGoapGoals(state: any): any[] {
        return [];
    }

    public getGoapActions(): any[] {
        return [];
    }

    protected get room() {
        return this.colony.getMainRoom();
    }

    public static scaleCreepBody(body: BodyPartConstant[], scale: number) {
        let scaledBody: BodyPartConstant[] = [];
        for (let i = 0; i < scale; i++) {
            scaledBody = scaledBody.concat(body);
        }
        return scaledBody;
    }

    public updateProfiles(): void {
        // Deprecated: Profiles are now generated dynamically in getSpawnerProfilesList
    }

    public getSpawnerProfilesList(): CreepSpawnerProfileInfo[] {
        const creepSpawners = this.getCreepSpawners();
        const profiles: CreepSpawnerProfileInfo[] = [];

        for (const spawner of creepSpawners) {
             const spawnerProfiles = spawner.createProfiles(this.energyUsageTracking.allowedEnergyWorkRate, this.colony);
             for (const name in spawnerProfiles) {
                 const profile = spawnerProfiles[name];
                 profiles.push(profile);

                 // Pruning Logic
                 this.pruneSpawnQueue(profile);
             }
        }
        return profiles;
    }

    private pruneSpawnQueue(profile: CreepSpawnerProfileInfo): void {
        if (!profile.memoryBlueprint || typeof profile.desiredAmount === 'undefined') {
            return;
        }
        const desired = profile.desiredAmount;
        const role = profile.memoryBlueprint.role;
        const targetId = profile.memoryBlueprint.workTargetId;

        // Count Alive
        const aliveCreeps = this.colony.getCreeps().filter(c => {
            if (c.memory.role !== role) return false;
            // Strict check for Harvesters (unique per source)
            if (targetId && c.memory.workTargetId !== targetId) return false;
            return true;
        });

        // Count Queued
        const spawnQueue = this.colony.getSpawnQueue();
        const queuedItems = spawnQueue.filter(req => {
            if (req.memory.role !== role) return false;
            if (targetId && req.memory.workTargetId !== targetId) return false;
            return true;
        });

        const total = aliveCreeps.length + queuedItems.length;
        let excess = total - desired;

        if (excess > 0) {
            // Remove from queue, starting from lowest priority (end of list usually, but queue is sorted High->Low)
            // So we want to remove from the end/bottom.

            // Find items to remove
            // Sort matching queued items by priority (Ascending) so we remove lowest first
            queuedItems.sort((a, b) => a.priority - b.priority);

            for (const item of queuedItems) {
                if (excess <= 0) break;
                this.colony.removeSpawnRequest(item.memory.name);
                excess--;
            }
        }
    }

    public getRoleCount(role: CreepRole): number {
        return this.colony.getCreepCount(role);
    }

    public abstract onStart(): void;
    /**
     * Main run loop for the system.
     * Derived classes should call super.run() to ensure energy weights are reset for the next tick.
     */
    public run(): void {
        this.energyUsageTracking.requestedEnergyUsageWeight = this.defaultEnergyWeight;
    }
    public abstract getRolesToTrackEnergy(): CreepRole[];
    public abstract getCreepSpawners(): CreepSpawner[];
}
