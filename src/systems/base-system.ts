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
}

export abstract class BaseSystemImpl implements BaseSystem {
    public abstract get systemInfo(): BaseSystemInfo;
    public abstract get energyUsageTracking(): EnergyUsageTracking;

    protected colony: ColonyManager;

    public constructor(colony: ColonyManager) {
        this.colony = colony;
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
        const creepSpawners = this.getCreepSpawners();
        for (const spawner of creepSpawners) {
            const profiles = spawner.createProfiles(this.energyUsageTracking.allowedEnergyWorkRate, this.colony);
            for (const name in profiles) {
                this.systemInfo.creepSpawnersInfo[name] = {
                    ...profiles[name],
                    creepNames: this.systemInfo.creepSpawnersInfo[name]?.creepNames || [],
                };
            }
        }
    }

    public getSpawnerProfilesList(): CreepSpawnerProfileInfo[] {
        const profiles: CreepSpawnerProfileInfo[] = [];
        for (const name in this.systemInfo.creepSpawnersInfo) {
            const profile = this.systemInfo.creepSpawnersInfo[name];
            profiles.push(profile);
        }
        return profiles;
    }

    public getRoleCount(role: CreepRole): number {
        const profiles = this.getSpawnerProfilesList();
        let count = 0;
        for (const profile of profiles) {
            if (profile.memoryBlueprint?.role !== role) {
                continue;
            }
            count += profile.creepNames?.length || 0;
        }
        return count;
    }

    public abstract onStart(): void;
    public abstract run(): void;
    public abstract onLevelUp(level: number): void;
    public abstract getRolesToTrackEnergy(): CreepRole[];
    public abstract getCreepSpawners(): CreepSpawner[];
}
