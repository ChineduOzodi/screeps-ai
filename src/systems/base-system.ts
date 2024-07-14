import { CreepRole, CreepSpawner } from "prototypes/creep";
import { ColonyManager } from "prototypes/colony";

export interface BaseSystem {
    /** Reference to the system data that lives in screeps. */
    get systemInfo(): ColonyBaseSystemInfo;

    /** Reference to the energy usage tracking data that lives in screeps. */
    get energyUsageTracking(): EnergyUsageTracking;

    /** What happens when an new colony is started. */
    onStart(): void;

    run(): void;

    /** What happens when the room controller levels up. */
    onLevelUp(level: number): void;

    /** Functionality to update profiles of creeps to be spawned by the spawning system. Primarily invoked by colony manager. */
    updateProfiles(): void;

    /** Get Roles to track energy */
    getRolesToTrackEnergy(): CreepRole[];
}

export abstract class BaseSystemImpl implements BaseSystem {
    public abstract get systemInfo(): ColonyBaseSystemInfo;
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

    public abstract onStart(): void;
    public abstract run(): void;
    public abstract onLevelUp(level: number): void;
    public abstract getRolesToTrackEnergy(): CreepRole[];
    public abstract getCreepSpawners(): CreepSpawner[];
}
