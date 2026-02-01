/* eslint-disable max-classes-per-file */
import { CreepProfiles, CreepRole, CreepRunner } from "prototypes/creep";
import { ColonyManager } from "prototypes/colony";
import { CreepConstants } from "constants/creep-constants";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { SpawnerUtils } from "utils/spawner-utils";

export class HarvesterCreep extends CreepRunner {
    public constructor(creep: Creep) {
        super(creep);
    }

    public override onRun(): void {
        const { creep, memory } = this;

        if (!memory.workTargetId) {
            throw new Error(`creep does not have sourceId in memory: ${creep.id}`);
        }

        if (memory.working && this.creep.store[RESOURCE_ENERGY] === creep.store.getCapacity()) {
            memory.working = false;
        }
        if (!memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            memory.working = true;
        }

        if (memory.working) {
            const source = Game.getObjectById<Source>(memory.workTargetId);
            // console.log(target);
            // moves to target
            // moves to source
            if (source) {
                if (this.harvest(source) === ERR_NOT_IN_RANGE) {
                    this.moveToWithReservation(source, memory.workDuration, undefined, ["builder", "upgrader"]);
                }
            } else {
                creep.say(`can't find source in room`);
            }
        } else {
            // finds closest storage / spawn to store energy
            let target: Structure | null = null;
            target = creep.pos.findClosestByPath<StructureExtension | StructureSpawn>(FIND_STRUCTURES, {
                filter: structure => {
                    return (
                        (structure.structureType === STRUCTURE_EXTENSION ||
                            structure.structureType === STRUCTURE_SPAWN) &&
                        structure.store[RESOURCE_ENERGY] < structure.store.getCapacity(RESOURCE_ENERGY)
                    );
                },
            });

            // StructureTower has lower priority than extensions and spawn so as not to
            // accidentally starve creep generation.
            if (!target) {
                target = creep.pos.findClosestByPath<StructureTower>(FIND_STRUCTURES, {
                    filter: structure => {
                        return (
                            structure.structureType === STRUCTURE_TOWER &&
                            structure.store[RESOURCE_ENERGY] < structure.store.getCapacity(RESOURCE_ENERGY)
                        );
                    },
                });
            }

            if (!target) {
                target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: structure => {
                        return (
                            (structure.structureType === STRUCTURE_CONTAINER ||
                                structure.structureType === STRUCTURE_STORAGE) &&
                            structure.store.getFreeCapacity() > 0
                        );
                    },
                });
            }
            if (target && this.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(target, 2);
            } else if (creep.room.controller && this.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(creep.room.controller, creep.memory.workDuration, 3);
            }
        }
    }
}

export class HarvesterCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(_energyRateCap: number, colony: ColonyManager): CreepProfiles {
        const profiles: CreepProfiles = {};
        for (const colonySource of colony.systems.energy.systemInfo.sources) {
            if (!colonySource.accessCount) {
                colonySource.accessCount = 1;
            }
            const spawn = colony.getMainSpawn();
            const profileName = `${CreepRole.HARVESTER}-${colonySource.sourceId}`;
            let energy = spawn.room.energyCapacityAvailable;
            if (colony.systems.energy.noEnergyCollectors()) {
                energy = spawn.room.energyAvailable;
            }
            profiles[profileName] = this.createHarvesterProfile(spawn, colonySource, energy);
        }
        return profiles;
    }

    private createHarvesterProfile(
        spawn: StructureSpawn,
        colonySource: ColonySource,
        energyCap: number,
    ): CreepSpawnerProfileInfo {
        const { sourceId, accessCount } = colonySource;
        const source = Game.getObjectById<Source>(sourceId);
        if (!source) {
            throw new Error(`Source not found with given id: ${sourceId}`);
        }
        const target = spawn;
        const path = target.pos.findPathTo(source, { ignoreCreeps: true, range: 1 });

        const sourceEnergyProductionPerTick = source.energyCapacity / ENERGY_REGEN_TIME; // how much energy produced per tick
        const travelTime = path.length * 3; // distance to source and back

        const body: BodyPartConstant[] = [];

        let workPartCount = 1;
        let carryPartCount = 1;
        let movePartCount = 1;

        let totalCost =
            CreepConstants.WORK_PART_COST * workPartCount +
            CreepConstants.CARRY_PART_COST * carryPartCount +
            CreepConstants.MOVE_PART_COST * movePartCount;

        let partCountMod = Math.floor(energyCap / totalCost);

        let energyProductionPerTick = SpawnerUtils.getEnergyProductionPerTick(
            workPartCount * partCountMod,
            carryPartCount * partCountMod,
            travelTime,
        );

        let count = 0;

        while (true) {
            count++;
            const pWorkPartCount = 1;
            const pCarryPartCount = carryPartCount + 2;
            const pMovePartCount = movePartCount + 1;
            const pTotalCost =
                CreepConstants.WORK_PART_COST * pWorkPartCount +
                CreepConstants.CARRY_PART_COST * pCarryPartCount +
                CreepConstants.MOVE_PART_COST * pMovePartCount;

            if (pTotalCost > energyCap) {
                // pTotalCost greater than energy available, breaking
                break;
            }

            const pPartCountMod = Math.floor(energyCap / pTotalCost);

            const pEnergyProductionPerTick = SpawnerUtils.getEnergyProductionPerTick(
                pWorkPartCount * pPartCountMod,
                pCarryPartCount * pPartCountMod,
                travelTime,
            );

            if (pEnergyProductionPerTick > energyProductionPerTick) {
                workPartCount = pWorkPartCount;
                carryPartCount = pCarryPartCount;
                movePartCount = pMovePartCount;
                totalCost = pTotalCost;
                partCountMod = pPartCountMod;
                energyProductionPerTick = pEnergyProductionPerTick;
            } else {
                // console.log(`pPPT < pPT: ${pEnergyProductionPerTick} < ${energyProductionPerTick}, breaking from loop`);
                break;
            }
            if (count >= 100) {
                console.log(`stuck in while loop, breaking`);
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
        const maxCreepCount = Math.min(
            5,
            Math.max(
                1,
                Math.round(
                    (travelTime / SpawnerUtils.getTimeEnergyProductionFullLoad(workPartCount, carryPartCount)) *
                        accessCount +
                        0.3,
                ),
            ),
        );

        const memory: AddCreepToQueueOptions = {
            workTargetId: source.id,
            workAmount: workPartCount,
            averageEnergyConsumptionProductionPerTick: energyProductionPerTick,
            workDuration: sourceHarvestDuration,
            role: CreepRole.HARVESTER,
        };
        const creepSpawnManagement: CreepSpawnerProfileInfo = {
            desiredAmount: Math.min(maxCreepCount, sourceEnergyProductionPerTick / energyProductionPerTick),
            bodyBlueprint: body,
            memoryBlueprint: memory,
            important: true,
        };

        return creepSpawnManagement;
    }
}
