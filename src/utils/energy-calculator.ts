import { BODYPART_COST_MAP } from "constants/creep-constants";

export class EnergyCalculator {
    /**
     * Calculates the energy cost to spawn a creep with the given body.
     */
    public static calculateBodyCost(body: BodyPartConstant[]): number {
        let cost = 0;
        for (const part of body) {
            cost += BODYPART_COST_MAP[part];
        }
        return cost;
    }

    /**
     * Calculates the estimated round-trip travel time between two positions.
     * Uses pathfinding to get accurate distance.
     * @param origin Starting position
     * @param destination Target position
     * @param loaded Whether the creep is loaded (for fatigue calculations - simplified here to assume full speed on roads/plains for now)
     */
    public static calculateTravelTime(origin: RoomPosition, destination: RoomPosition): number {
        const path = origin.findPathTo(destination, {
            ignoreCreeps: true,
            range: 1
        });
        return path.length;
    }

    /**
     * Calculates the theoretical energy production per tick for a harvester cycle.
     * Cycle: Travel to Source -> Harvest until full -> Travel to Dropoff -> Dropoff
     */
    public static calculateHarvesterProductionPerTick(
        body: BodyPartConstant[],
        distanceToSource: number,
        distanceToDropoff: number
    ): number {
        const workParts = body.filter(p => p === WORK).length;
        const carryParts = body.filter(p => p === CARRY).length;
        const moveParts = body.filter(p => p === MOVE).length;

        if (workParts === 0 || carryParts === 0 || moveParts === 0) return 0;

        const carryCapacity = carryParts * CARRY_CAPACITY;
        const harvestRate = workParts * 2; // 2 energy per tick per WORK part

        const timeToHarvest = Math.ceil(carryCapacity / harvestRate);
        const travelTime = distanceToSource + distanceToDropoff;
        // 1 tick to transfer/withdraw usually, but let's assume 1 for transfer
        const transferTime = 1;

        const totalCycleTime = travelTime + timeToHarvest + transferTime;

        return carryCapacity / totalCycleTime;
    }

    /**
     * Calculates the theoretical energy consumption per tick for a worker (Builder/Upgrader/Repairer).
     * Cycle: Travel to Source -> Withdraw -> Travel to Work Target -> Work until empty
     */
    public static calculateWorkerConsumptionPerTick(
        body: BodyPartConstant[],
        distanceToSource: number,
        workActionCost: number = 1 // 1 for upgrade/repair, 5 for build
    ): number {
        const workParts = body.filter(p => p === WORK).length;
        const carryParts = body.filter(p => p === CARRY).length;

        if (workParts === 0 || carryParts === 0) return 0;

        const carryCapacity = carryParts * CARRY_CAPACITY;
        const workRate = workParts * workActionCost;

        const timeToWork = Math.ceil(carryCapacity / workRate);
        // Round trip assumption: Start at work -> Go to source -> Return to work
        const travelTime = distanceToSource * 2;
        const withdrawTime = 1;

        const totalCycleTime = travelTime + timeToWork + withdrawTime;

        return carryCapacity / totalCycleTime;
    }
}
