import { ColonyExtras } from "./../prototypes/colony";
import { CreepConstants } from "./../constants/creep-constants";
import { MovementSystem } from "./movement-system";
import { SpawningSystem } from "./spawning-system";

/**
 * Ensures that we are producing as much energy as we can from the selected rooms for a given colony.
 */
export class EnergySystem {
    private colony: ColonyExtras;
    private shouldUpdate: boolean;

    public constructor(colony: ColonyExtras) {
        this.colony = colony;
        this.shouldUpdate = false;
    }

    public static run(colony: ColonyExtras): void {
        const energySystem = new EnergySystem(colony);
        energySystem.manage();
    }

    private get energyManagement() {
        return this.colony.colonyInfo.energyManagement;
    }

    private get room() {
        return this.colony.getMainRoom();
    }

    public manage(): void {
        if (this.energyManagement.nextUpdate < Game.time) {
            this.energyManagement.nextUpdate = Game.time + 500;
            this.resetHarvestTracking();
            this.shouldUpdate = true;
            this.energyManagement.lastUpdate = Game.time;
        }

        this.manageHarvesters();
    }

    private resetHarvestTracking() {
        for (const colonySource of this.energyManagement.sources) {
            colonySource.cumulativeHarvestedEnergy = 0;
        }
    }

    public manageHarvesters(): void {
        for (const colonySource of this.energyManagement.sources) {
            if (!colonySource.accessCount) {
                colonySource.accessCount = 1;
            }
            if (!colonySource.harvesters) {
                console.log(`${this.colony.colonyInfo.roomName} energy-system | creating harvester profile`);
                colonySource.harvesters = this.createHarvesterProfile(colonySource);
            } else if (this.shouldUpdate) {
                colonySource.harvesters = this.updateHarvesterProfile(colonySource);
            }
            SpawningSystem.run(this.colony, colonySource.harvesters);
        }
        this.calculateHarvestersProductionEfficiency();
    }

    private calculateHarvestersProductionEfficiency() {
        const totalEnergyGained = this.energyManagement.sources
            .map(x => x.cumulativeHarvestedEnergy || 0)
            .reduce((a, b) => a + b);
        const totalTimeUsed = Math.max(
            Game.time - (this.energyManagement.lastUpdate || this.energyManagement.nextUpdate - 500),
            1
        );

        this.energyManagement.estimatedEnergyProductionEfficiency =
            totalEnergyGained / totalTimeUsed / this.energyManagement.estimatedEnergyProductionRate;
    }

    private createHarvesterProfile(colonySource: ColonySource): ColonyCreepSpawnManagement {
        const { sourceId, accessCount } = colonySource;
        const source = Game.getObjectById<Source>(sourceId);
        if (!source) {
            throw new Error(`Source not found with given id: ${sourceId}`);
        }
        const target = this.colony.getMainSpawn();
        const path = target.pos.findPathTo(source, { ignoreCreeps: true, range: 1 });

        const sourceEnergyProductionPerTick = source.energyCapacity / ENERGY_REGEN_TIME; // how much energy produced per tick
        const travelTime = path.length * 3; // distance to source and back

        const energyAvailable = this.room.energyCapacityAvailable;

        const body: BodyPartConstant[] = [];

        let workPartCount = 1;
        let carryPartCount = 1;
        let movePartCount = 1;

        let totalCost =
            CreepConstants.WORK_PART_COST * workPartCount +
            CreepConstants.CARRY_PART_COST * carryPartCount +
            CreepConstants.MOVE_PART_COST * movePartCount;

        let partCountMod = Math.floor(energyAvailable / totalCost);

        let energyProductionPerTick = this.getEnergyProductionPerTick(
            workPartCount * partCountMod,
            carryPartCount * partCountMod,
            travelTime
        );

        let count = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            count++;
            const pWorkPartCount = 1;
            const pCarryPartCount = carryPartCount + 2;
            const pMovePartCount = movePartCount + 1;
            const pTotalCost =
                CreepConstants.WORK_PART_COST * pWorkPartCount +
                CreepConstants.CARRY_PART_COST * pCarryPartCount +
                CreepConstants.MOVE_PART_COST * pMovePartCount;

            if (pTotalCost > energyAvailable) {
                console.log(`pTotalCost greater than energy available, breaking`);
                break;
            }

            const pPartCountMod = Math.floor(energyAvailable / pTotalCost);

            const pEnergyProductionPerTick = this.getEnergyProductionPerTick(
                pWorkPartCount * pPartCountMod,
                pCarryPartCount * pPartCountMod,
                travelTime
            );

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
                    (travelTime / this.getTimeEnergyProductionFullLoad(workPartCount, carryPartCount)) * accessCount +
                        0.3
                )
            )
        );

        const memory: AddCreepToQueueOptions = {
            workTargetId: source.id,
            workAmount: workPartCount,
            averageEnergyConsumptionProductionPerTick: energyProductionPerTick,
            workDuration: sourceHarvestDuration,
            role: "harvester"
        };
        const creepSpawnManagement: ColonyCreepSpawnManagement = {
            creepNames: [],
            desiredAmount: Math.min(maxCreepCount, sourceEnergyProductionPerTick / energyProductionPerTick),
            bodyBlueprint: body,
            memoryBlueprint: memory
        };

        return creepSpawnManagement;
    }

    private updateHarvesterProfile(colonySource: ColonySource): ColonyCreepSpawnManagement {
        console.log(`${this.colony.colonyInfo.roomName} energy-system | updating harvester profile`);
        const newHarvesterProfile = this.createHarvesterProfile(colonySource);
        newHarvesterProfile.creepNames = colonySource.harvesters?.creepNames || [];
        return newHarvesterProfile;
    }

    private getEnergyProductionPerTick(workPartCount: number, carryPartCount: number, distance: number): number {
        const energyCarried = CARRY_CAPACITY * carryPartCount;
        const energyPerTick =
            energyCarried / (this.getTimeEnergyProductionFullLoad(workPartCount, carryPartCount) + distance + 1);
        return energyPerTick;
    }

    private getTimeEnergyProductionFullLoad(workPartCount: number, carryPartCount: number) {
        const energyCarried = CARRY_CAPACITY * carryPartCount;
        return energyCarried / (workPartCount * CreepConstants.WORK_PART_ENERGY_HARVEST_PER_TICK);
    }

    public static getEnergy(creep: Creep): void {
        let target: Tombstone | AnyStructure | Resource<ResourceConstant> | Source | null = null;
        if (creep.memory.targetId) {
            target = Game.getObjectById<Tombstone | StructureExtension | StructureSpawn | StructureTower>(
                creep.memory.targetId
            );
            if (!target) {
                delete creep.memory.targetId;
                delete creep.memory.movementSystem?.path;
            }
        } else {
            target = creep.pos.findClosestByPath(FIND_TOMBSTONES, {
                filter: stone => {
                    return stone.store[RESOURCE_ENERGY] >= 25;
                }
            });

            if (!target) {
                target = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                    filter: resource => {
                        return resource.amount >= 40 && resource.resourceType === RESOURCE_ENERGY;
                    }
                });
            }

            if (!target) {
                target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: structure => {
                        return (
                            (structure.structureType === STRUCTURE_CONTAINER ||
                                structure.structureType === STRUCTURE_STORAGE) &&
                            structure.store[RESOURCE_ENERGY] >= 25
                        );
                    }
                });
            }

            if (!target) {
                target = creep.pos.findClosestByPath<StructureSpawn>(FIND_STRUCTURES, {
                    filter: structure => {
                        return (
                            structure.structureType === STRUCTURE_SPAWN &&
                            structure.store.energy === structure.store.getCapacity(RESOURCE_ENERGY)
                        );
                    }
                });
            }

            if (!target) {
                target = creep.pos.findClosestByPath(FIND_SOURCES, {
                    filter: s => {
                        return s.energy !== 0;
                    }
                });
            }

            creep.memory.targetId = target?.id;
            delete creep.memory.movementSystem?.path;
        }

        if (target) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const targetAction = target as any;
            if (
                creep.withdraw(targetAction, RESOURCE_ENERGY) !== 0 &&
                creep.transfer(targetAction, RESOURCE_ENERGY) !== 0 &&
                creep.pickup(targetAction) !== 0 &&
                creep.harvest(targetAction) !== 0
            ) {
                MovementSystem.moveToWithReservation(creep, target, creep.memory.workDuration * 0.5);
            }
        }
    }
}
