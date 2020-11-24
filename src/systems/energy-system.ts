import { ColonyExtras } from './../prototypes/colony';
import { CreepConstants } from './../constants/creep-constants';
export class EnergySystem {
    /**
     * returns how many work parts you need in order to harvest and store energy available in the room
     * @param {*} room game room to search 
     */
    static calculateGathererCreeps(colony: ColonyExtras, room: Room) {
        const sources = room.find(FIND_SOURCES);
        const target = colony.getMainSpawn();
        if (!target) {
            throw new Error(`missing main spawn for colony: ${colony.colony.id}`);
        }

        for (const source of sources) {
            const path = target.pos.findPathTo(source, { 'ignoreCreeps': true, range: 1 });

            const maxCreepCount = 10;
            const sourceEnergyProductionPerTick = source.energyCapacity / 300; //how much energy produced per tick
            const travelTime = path.length * 2; //distance to source and back

            const energyAvailable = room.energyCapacityAvailable;

            const body: BodyPartConstant[] = [];

            let workPartCount = 1;
            let carryPartCount = 1;
            let movePartCount = 1;

            let totalCost = CreepConstants.WORK_PART_COST * workPartCount + CreepConstants.CARRY_PART_COST * carryPartCount + CreepConstants.MOVE_PART_COST + movePartCount;

            let partCountMod = Math.floor(energyAvailable / totalCost);

            let energyProductionPerTick = this.getEnergyProductionPerTick(workPartCount * partCountMod, carryPartCount * partCountMod, travelTime);

            let count = 0;
            while (true) {
                count++;
                const pWorkPartCount = 1;
                const pCarryPartCount = carryPartCount + 2;
                const pMovePartCount = movePartCount + 1;
                const pTotalCost = CreepConstants.WORK_PART_COST * pWorkPartCount + CreepConstants.CARRY_PART_COST * pCarryPartCount + CreepConstants.MOVE_PART_COST + pMovePartCount;

                if (pTotalCost > energyAvailable) {
                    console.log(`pTotalCost greater than energy available, breaking`);
                    break;
                }

                let pPartCountMod = Math.floor(energyAvailable / pTotalCost);

                let pEnergyProductionPerTick = this.getEnergyProductionPerTick(pWorkPartCount * pPartCountMod, pCarryPartCount * pPartCountMod, travelTime);

                if (pEnergyProductionPerTick > energyProductionPerTick) {
                    workPartCount = pWorkPartCount;
                    carryPartCount = pCarryPartCount;
                    movePartCount = pMovePartCount;
                    totalCost = pTotalCost;
                    partCountMod = pPartCountMod;
                    energyProductionPerTick = pEnergyProductionPerTick;
                } else {
                    console.log(`pPPT < pPT: ${pEnergyProductionPerTick} < ${energyProductionPerTick}, breaking from loop`);
                    break;
                }
                if (count >= 100) {
                    console.error(`stuck in while loop, breaking`);
                    break;
                }
            }

            for (let i = 0; i < workPartCount * partCountMod; i++) {
                body.push(WORK);
            }
            for (let i = 0; i < carryPartCount * partCountMod; i++) {
                body.push(CARRY);
            }
            for (let i = 0; i < movePartCount * partCountMod; i++) {
                body.push(MOVE);
            }

            colony.addToSpawnCreepQueue(body, 'harvester', source.id);
        }
    }

    static getEnergyProductionPerTick(workPartCount: number, carryPartCount: number, distance: number) {
        const energyCarried = CreepConstants.CARRY_PART_COST * carryPartCount;
        const energyPerTick = energyCarried / (energyCarried / (workPartCount * CreepConstants.WORK_PART_ENERGY_HARVEST_PER_TICK) + distance + 1);
        return energyPerTick;
    }
}