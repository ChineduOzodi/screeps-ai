export interface EnergyTracking {
    /** Positive is for energy gain, negative for energy loss. Must be called every tick to be accurate. */
    onTickFlow(energy: number): void;

    getAverageEnergyFlow(): number;
}

export class EnergyTrackingImpl implements EnergyTracking {
    private energyInfo: EnergyTrackingInfo;

    /**
     * Allows you to track the average energy flow of an entity (creep, spawn, etc.) to be used to allocate energy spend to systems.
     * @param memoryLocation Location in Memory the energyTackingInfo is stored. It should at least be an empty dictionary.
     * @param numberTicks Number of ticks to use for average;
     */
    public constructor(memoryLocation: EnergyTrackingInfo) {
        this.energyInfo = memoryLocation;

        if (!this.energyInfo) {
            this.setupEnergyTracking();
        }
    }

    private setupEnergyTracking() {
        this.energyInfo.count = 0;
        this.energyInfo.average = 0;
        this.energyInfo.total = 0;
    }

    /** Adds Energy to flow array and calculates average. */
    public onTickFlow(energy: number): void {
        if (
            typeof this.energyInfo.average == "undefined" ||
            typeof this.energyInfo.count == "undefined" ||
            typeof this.energyInfo.total == "undefined"
        ) {
            console.log(`EnergyTracking missing expected field, resetting: ${JSON.stringify(this.energyInfo)}`);
            this.energyInfo.count = 0;
            this.energyInfo.average = 0;
            this.energyInfo.total = 0;
        }

        this.energyInfo.total += energy;
        this.energyInfo.count++;

        this.energyInfo.average = this.energyInfo.total / this.energyInfo.count;
    }

    public getAverageEnergyFlow(): number {
        return this.energyInfo.average || 0;
    }
}
