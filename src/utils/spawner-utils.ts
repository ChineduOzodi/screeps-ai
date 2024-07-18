import { CreepConstants } from "constants/creep-constants";

export class SpawnerUtils {
    public static getEnergyProductionPerTick(workPartCount: number, carryPartCount: number, distance: number): number {
        const energyCarried = CARRY_CAPACITY * carryPartCount;
        const energyPerTick =
            energyCarried / (this.getTimeEnergyProductionFullLoad(workPartCount, carryPartCount) + distance + 1);
        return energyPerTick;
    }

    public static getTimeEnergyProductionFullLoad(workPartCount: number, carryPartCount: number) {
        const energyCarried = CARRY_CAPACITY * carryPartCount;
        return energyCarried / (workPartCount * CreepConstants.WORK_PART_ENERGY_HARVEST_PER_TICK);
    }
}
