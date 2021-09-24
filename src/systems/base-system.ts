import { ColonyExtras } from "prototypes/colony";

export class BaseSystem {
    protected colony: ColonyExtras;
    protected room: Room;
    protected shouldUpdate: boolean;
    protected stage: number;
    protected management: ColonyBaseManagement;

    public constructor(colony: ColonyExtras) {
        this.colony = colony;
        this.room = colony.getMainRoom();
        this.stage = this.determineStage();
        this.management = this.getManagement(colony);
        this.shouldUpdate = this.checkShouldUpdate();
    }

    public static run(colony: ColonyExtras): void {
        const system = new BaseSystem(colony);
        system.manage();
    }

    public static scaleCreepBody(body: BodyPartConstant[], scale: number) {
        let scaledBody: BodyPartConstant[] = [];
        for (let i = 0; i < scale; i++) {
            scaledBody = scaledBody.concat(body);
        }
        return scaledBody;
    }

    public manage(): void {
        throw new Error("Should override manage method");
    }

    protected getManagement(colony: ColonyExtras): ColonyBaseManagement {
        throw new Error("Should override manage method");
    }

    protected determineStage(): number {
        throw new Error("Should override manage method");
    }

    protected checkShouldUpdate(): boolean {
        throw new Error("Should override manage method");
    }
}
