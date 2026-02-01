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

    /** What happens when the room controller levels up. The same level could happen more than once, if a room level drops.*/
    onLevelUp(level: number): void;

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
                 profiles.push(spawnerProfiles[name]);
             }
        }
        return profiles;
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
    public abstract onLevelUp(level: number): void;
    public abstract getRolesToTrackEnergy(): CreepRole[];
    public abstract getCreepSpawners(): CreepSpawner[];
}
