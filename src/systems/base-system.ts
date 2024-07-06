import { ColonyManager } from "prototypes/colony";

export interface BaseSystem {
    /** What happens when an new colony is started. */
    onStart(): void;

    run(): void;

    /** What happens when the room controller levels up. */
    onLevelUp(level: number): void;

    /** Functionality to update profiles of creeps to be spawned by the spawning system. Primarily invoked by colony manager. */
    updateProfiles(): void;

    /** Reference to the system data that lives in screeps. */
    get systemInfo(): ColonyBaseSystemInfo;
}

export abstract class BaseSystemImpl implements BaseSystem {
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

    public abstract get systemInfo(): ColonyBaseSystemInfo;

    public abstract onStart(): void;
    public abstract run(): void;
    public abstract onLevelUp(level: number): void;
    public abstract updateProfiles(): void;
}
