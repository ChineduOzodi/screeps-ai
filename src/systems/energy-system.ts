import { SpawningSystem } from './spawning-system';
import { MovementSystem } from './movement-system';
import { PathfindingSystem } from './pathfinding-system';
import { ColonyExtras } from './../prototypes/colony';
import { CreepConstants } from './../constants/creep-constants';
export class EnergySystem {

    static runHarvesterCreep(creep: Creep) {
        //requirements
        if (!creep.memory.workTargetId) {
            throw new Error(`creep does not have sourceId in memory: ${creep.id}`);
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
            const source = Game.getObjectById<Source>(creep.memory.workTargetId);
            //console.log(target);
            // moves to target
            // moves to source
            if (source) {
                if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
                    MovementSystem.moveToWithReservation(creep, source, creep.memory.workDuration)
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
            if (!colonySource.harvesters) {
                colonySource.harvesters = this.createHarvesterProfile(colony, colonySource.sourceId);
            }

            SpawningSystem.run(colony, colonySource.harvesters);
        }
    }

    static createHarvesterProfile(colony: ColonyExtras, sourceId: string) {
        const source = Game.getObjectById<Source>(sourceId);
        if (!source) {
            throw new Error(`Source not found with given id: ${sourceId}`);
        }
        const target = colony.getMainSpawn();
        const room = colony.getMainRoom();
        const path = target.pos.findPathTo(source, { 'ignoreCreeps': true, range: 1 });

        const maxCreepCount = 3;
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

        const memory: AddCreepToQueueOptions = {
            workTargetId: source.id,
            averageEnergyProductionPerTick: energyProductionPerTick,
            workDuration: sourceHarvestDuration
        }
        const creepSpawnManagement: ColonyCreepSpawnManagement = {
            role: 'harvester',
            creepNames: [],
            desiredAmount: Math.min(maxCreepCount,sourceEnergyProductionPerTick / energyProductionPerTick),
            bodyBlueprint: body,
            memoryBlueprint: memory
        }

        return creepSpawnManagement;
    }

    static getEnergyProductionPerTick(workPartCount: number, carryPartCount: number, distance: number) {
        const energyCarried = CreepConstants.CARRY_PART_COST * carryPartCount;
        const energyPerTick = energyCarried / (energyCarried / (workPartCount * CreepConstants.WORK_PART_ENERGY_HARVEST_PER_TICK) + distance + 1);
        return energyPerTick;
    }

    static getEnergy(creep: Creep) {
        // look for tombstones with energy
        const target = creep.pos.findClosestByPath(FIND_TOMBSTONES, {
            filter: (stone) => {
                return stone.store[RESOURCE_ENERGY] >= 25;
            }
        });

        if (target) {
            // move to tombstone
            if (creep.pos.getRangeTo(target) <= 1) {
                creep.withdraw(target, RESOURCE_ENERGY);
            }
            else {
                MovementSystem.moveToWithReservation(creep, target, 2);
            }
        } else {

            const target = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                filter: (resource) => {
                    return resource.amount >= 40 && resource.resourceType == RESOURCE_ENERGY;
                }
            });
            if (target) {
                if (creep.pickup(target) === ERR_NOT_IN_RANGE) {
                    MovementSystem.moveToWithReservation(creep, target, 2);
                }
            } else {
                // look for other energy sources
                const target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return (structure.structureType == STRUCTURE_CONTAINER ||
                            structure.structureType == STRUCTURE_STORAGE) &&
                            structure.store[RESOURCE_ENERGY] >= 25;
                    }
                });

                if (target) {

                    if (creep.pos.getRangeTo(target) <= 1) {
                        creep.withdraw(target, RESOURCE_ENERGY);
                    }
                    else {
                        MovementSystem.moveToWithReservation(creep, target, 2);
                    }
                }
                else {
                    const source = creep.pos.findClosestByPath(FIND_SOURCES, { filter: (s) => { return s.energy != 0; } });
                    if (source && creep.harvest(source) == ERR_NOT_IN_RANGE) {
                        let workDuration = creep.memory.workDuration;
                        if (workDuration && creep.memory.role === 'upgrader') {
                            workDuration *= 0.5;
                        }
                        MovementSystem.moveToWithReservation(creep, source, workDuration);
                    }
                }
            }
        }
    }
    
}