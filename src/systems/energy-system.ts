import { MovementSystem } from './movement-system';
import { PathfindingSystem } from './pathfinding-system';
import { ColonyExtras } from './../prototypes/colony';
import { CreepConstants } from './../constants/creep-constants';
export class EnergySystem {

    static runHarvesterCreep(creep: Creep) {
        //requirements
        if (!creep.memory.sourceId || !creep.memory.sourceHarvestDuration) {
            throw new Error(`creep does not have sourceId,sourceHarvestDuration in memory: ${creep.id}`);
        }

        if (creep.memory.working && creep.store[RESOURCE_ENERGY] == creep.store.getCapacity()) {
            creep.memory.working = false;
            creep.say('delivering');
        }
        if (!creep.memory.working && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.working = true;
            creep.say('harvesting');
        }

        if (creep.memory.working) {
            const source = Game.getObjectById<Source>(creep.memory.sourceId);
            //console.log(target);
            // moves to target
            // moves to source
            if (source) {
                if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
                    MovementSystem.moveToWithReservation(creep, source, creep.memory.sourceHarvestDuration)
                }
            } else {
                creep.say(`can't find source in room`);
            }
        }
        else {
            // finds closest storage / spawn to store energy
            let target: StructureExtension | StructureSpawn | StructureTower | null = null;
            if (creep.memory.targetId) {
                target = Game.getObjectById<StructureExtension | StructureSpawn | StructureTower>(creep.memory.targetId);
            } else {
                target = creep.pos.findClosestByPath<StructureExtension | StructureSpawn | StructureTower>(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return (structure.structureType == STRUCTURE_EXTENSION ||
                            structure.structureType == STRUCTURE_SPAWN ||
                            structure.structureType == STRUCTURE_TOWER)
                            && structure.energy < structure.energyCapacity;
                    }
                });
            }
            //console.log(target.id);
            if (target) {
                if (creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    MovementSystem.moveToWithReservation(creep, target, 2);
                }
            }
        }
    }

    static run(colony: ColonyExtras) {
        const room = colony.getMainRoom();

        let stage = 0;
        if (room.energyCapacityAvailable >= 500) {
            stage = 1;
        }

        switch (stage) {
            case 0:
                this.manageHarvesters(colony);
                break;

            default:
                break;
        }
    }

    static manageHarvesters(colony: ColonyExtras) {
        for (const colonySource of colony.colony.energyManagement.sources) {
            if (colonySource.desiredHarvesters === 0) {
                this.createHarvesterProfile(colony, colonySource);
            }
            for (let i = colonySource.harvesterNames.length - 1; i >= 0; i--) {
                const harvesterName = colonySource.harvesterNames[i];
                if (!(harvesterName in colony.colony.creeps)) {
                    colonySource.harvesterNames.splice(i,1);
                }
            }

            if (colonySource.harvesterNames.length < colonySource.desiredHarvesters) {
                if (!colonySource.harvesterBodyBlueprint) {
                    throw new Error(`Missing harverster body blueprint for colony: ${colony.getId()}`);
                }
                
                for (let i = 0; i < colonySource.desiredHarvesters; i++) {
                    const harvesterName = colony.addToSpawnCreepQueue(colonySource.harvesterBodyBlueprint, 'harvester', colonySource.harvesterMemoryBlueprint);
                    colonySource.harvesterNames.push(harvesterName);
                }
            }
        }
    }

    static createHarvesterProfile(colony: ColonyExtras, colonySources: ColonySources) {
        const { sourceId } = colonySources;
        const source = Game.getObjectById<Source>(sourceId);
        if (!source) {
            throw new Error(`Source not found with given id: ${sourceId}`);
        }
        const target = colony.getMainSpawn();
        const room = colony.getMainRoom();
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

        const sourceHarvestDuration = (carryPartCount * partCountMod * 50) / (workPartCount * partCountMod * 2);

        colonySources.harvesterBodyBlueprint = body;
        colonySources.harvesterMemoryBlueprint = {
            sourceId: source.id,
            averageEnergyProductionPerTick: energyProductionPerTick,
            sourceHarvestDuration
        }
        colonySources.desiredHarvesters = 2;
    }

    static getEnergyProductionPerTick(workPartCount: number, carryPartCount: number, distance: number) {
        const energyCarried = CreepConstants.CARRY_PART_COST * carryPartCount;
        const energyPerTick = energyCarried / (energyCarried / (workPartCount * CreepConstants.WORK_PART_ENERGY_HARVEST_PER_TICK) + distance + 1);
        return energyPerTick;
    }
}