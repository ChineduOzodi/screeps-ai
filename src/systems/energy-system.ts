import { ColonyExtras } from "./../prototypes/colony";
import { CreepConstants } from "./../constants/creep-constants";
import { MovementSystem } from "./movement-system";
import { SpawningSystem } from "./spawning-system";
import { BaseSystem, BaseSystemImpl } from "./base-system";

/**
 * Ensures that we are producing as much energy as we can from the selected rooms for a given colony.
 */
export class EnergySystem extends BaseSystemImpl {

    public override get systemInfo(): ColonyEnergyManagement {
        if (!this.colony.colonyInfo.energyManagement) {
            this.colony.colonyInfo.energyManagement = {
                nextUpdate: Game.time,
                sources: [],
                energyUsageModifier: 1,
                estimatedEnergyProductionRate: 0,
                estimatedEnergyProductionEfficiency: 0,
                totalEnergyUsagePercentageAllowed: 0
            };
        }
        return this.colony.colonyInfo.energyManagement;
    }

    public override onStart(): void {
        this.resetHarvestTracking();
    }

    public override run(): void {
        this.manageHarvesters();
    }

    public override onLevelUp(_level: number): void { }

    public override updateProfiles(): void {
        this.resetHarvestTracking();
        for (const colonySource of this.systemInfo.sources) {
            if (!colonySource.harvesters) {
                console.log(`${this.colony.colonyInfo.id} energy-system | creating harvester profile`);
                colonySource.harvesters = this.createHarvesterProfile(colonySource);
            } else {
                colonySource.harvesters = this.updateHarvesterProfile(colonySource);
            }
        }

    }

    private resetHarvestTracking() {
        for (const colonySource of this.systemInfo.sources) {
            colonySource.cumulativeHarvestedEnergy = 0;
        }
        this.systemInfo.lastUpdate = Game.time;
    }

    public manageHarvesters(): void {
        for (const colonySource of this.systemInfo.sources) {
            if (!colonySource.accessCount) {
                colonySource.accessCount = 1;
            }
            if (!colonySource.harvesters) {
                console.log("ERROR: ${this.colony.colonyInfo.id} energy-system | harvesters undefined");
                colonySource.harvesters = this.createHarvesterProfile(colonySource);
            }
            SpawningSystem.run(this.colony, colonySource.harvesters);
        }
        this.calculateHarvestersProductionEfficiency();
    }

    private calculateHarvestersProductionEfficiency() {
        if (!this.systemInfo.lastUpdate) {
            console.log("ERROR: ${this.colony.colonyInfo.id} energy-system | lastUpdate undefined");
            this.systemInfo.lastUpdate = Game.time - 1;
        }
        const totalEnergyGained = this.systemInfo.sources
            .map(x => x.cumulativeHarvestedEnergy || 0)
            .reduce((a, b) => a + b);
        const totalTimeUsed = Math.max(Game.time - this.systemInfo.lastUpdate, 1);

        this.systemInfo.estimatedEnergyProductionEfficiency =
            totalEnergyGained / totalTimeUsed / this.systemInfo.estimatedEnergyProductionRate;
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
        console.log(`${this.colony.colonyInfo.id} energy-system | updating harvester profile`);
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
        } else {
            creep.say("Can't find energy");
        }
    }
}

export interface EnergyTracking {
    /** Positive is for energy gain, negative for energy loss. Must be called every tick to be accurate. */
    onTickFlow(energy: number): void

    getAverageEnergyFlow(): number
}

export class EnergyTrackingImpl implements EnergyTracking {

    energyInfo: EnergyTrackingInfo;

    /**
     * Allows you to track the average energy flow of an entity (creep, spawn, etc.) to be used to allocate energy spend to systems.
     * @param memoryLocation Location in Memory the energyTackingInfo is stored. It should at least be an empty dictionary.
     * @param numberTicks Number of ticks to use for average;
     */
    constructor(memoryLocation: EnergyTrackingInfo, numberTicks: number) {
        this.energyInfo = memoryLocation;

        if (!this.energyInfo || !this.energyInfo.energyFlow || this.energyInfo.energyFlow.length != numberTicks) {
            this.setupEnergyTracking(numberTicks);
        }
    }

    setupEnergyTracking(numberTicks: number) {
        this.energyInfo.energyFlow = new Array(numberTicks);
        this.energyInfo.count = 0;
        this.energyInfo.index = 0;
        this.energyInfo.average = 0;
        this.energyInfo.total = 0;
    }

    /** Adds Energy to flow array and calculates average. */
    onTickFlow(energy: number): void {
        if (typeof this.energyInfo.average == "undefined" ||
            typeof this.energyInfo.count == "undefined" ||
            typeof this.energyInfo.energyFlow == "undefined" ||
            typeof this.energyInfo.index == "undefined" ||
            typeof this.energyInfo.total == "undefined") {
            console.log(`EnergyTracking missing expected field, resetting: ${JSON.stringify(this.energyInfo)}`);
            this.setupEnergyTracking(this.energyInfo.energyFlow?.length || this.energyInfo.count || 50);
            return;
        }

        this.energyInfo.total += energy;

        if (this.energyInfo.count == this.energyInfo.energyFlow.length) {
            const subtractNumber = this.energyInfo.energyFlow[this.energyInfo.index];
            this.energyInfo.total -= subtractNumber;
        } else {
            this.energyInfo.count++;
        }

        this.energyInfo.average = this.energyInfo.total / this.energyInfo.count;
        this.energyInfo.energyFlow[this.energyInfo.index] = energy;

        const nextIndex = (this.energyInfo.index+1) % this.energyInfo.energyFlow.length;
        this.energyInfo.index = nextIndex;
    }

    getAverageEnergyFlow(): number {
        return this.energyInfo.average || 0;
    }
}
