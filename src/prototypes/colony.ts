import { BuilderSystem } from "./../systems/builder-system";
import { InfrastructureSystem } from "../systems/infrastructure-system";
import { CreepStatus } from "./creep";
import { DefenceSystem } from "./../systems/defence-system";
import { EnergySystem } from "./../systems/energy-system";
import { MovementSystem } from "systems/movement-system";
import { UpgradeSystem } from "./../systems/upgrade-system";

interface Colony {
    id: string;
    spawnIndex: number;
    setupComplete?: boolean;
    spawnEnergy: number;
    screepCount: ScreepCount;
    creeps: ColonyCreeps | undefined;
    rooms: RoomData[];
    mainSpawnId: string;
    spawnQueue: SpawnRequest[] | undefined;
    stats: ColonyStats;
    energyManagement: ColonyEnergyManagement;
    upgradeManagement: ColonyUpgradeManagement;
    builderManagement: ColonyBuilderManagement;
    defenceManagement: ColonyDefenceManagement;
    infrastructureManagement?: ColonyInfrastructureManagement;
}

export class ColonyExtras {
    public colony: Colony;
    public constructor(colony: Colony) {
        this.colony = colony;
    }

    public run(): void {
        if (!this.colony.setupComplete) {
            this.colony.setupComplete = this.initialSetup();
        }

        this.creepSpawnManager();
        this.manageEnergyProductionConsumption();

        DefenceSystem.run(this);
        EnergySystem.run(this);
        InfrastructureSystem.run(this);
        UpgradeSystem.run(this);
        BuilderSystem.run(this);

        this.creepManager();
        this.visualizeStats();
    }

    public visualizeStats(): void {
        const room = this.getMainRoom();
        room.visual.text(`Colony: ${this.colony.id}`, 3, 5, { color: "white", font: 1, align: "left" });

        const textStyle: TextStyle = { color: "white", font: 0.5, align: "left" };
        const {
            estimatedEnergyProductionRate,
            totalEnergyUsagePercentageAllowed: totalEnergyUsagePercentage,
            estimatedEnergyProductionEfficiency
        } = this.colony.energyManagement;
        room.visual.text(
            `Energy Production Estimate: ${estimatedEnergyProductionRate.toFixed(2)}, Actual: ${(
                estimatedEnergyProductionRate * (estimatedEnergyProductionEfficiency || 0)
            ).toFixed(2)}
            Efficiency: ${(estimatedEnergyProductionEfficiency || 0).toFixed(2)}
            Energy Usage Percent: ${totalEnergyUsagePercentage.toFixed(2)}`,
            3,
            6,
            textStyle
        );

        const visualizeSystems = this.getEnergyTrackingSystems();
        this.visualizeSystems(visualizeSystems);
    }

    public getEnergyTrackingSystems(): EnergyTrackingSystem[] {
        const systems: EnergyTrackingSystem[] = [
            {
                systemName: "Upgrade System",
                energyTracking: this.colony.upgradeManagement.upgraderEnergy
            },
            {
                systemName: "Builder System",
                energyTracking: this.colony.builderManagement.builderEnergy
            }
        ];
        return systems;
    }

    public visualizeSystems(options: EnergyTrackingSystem[]): void {
        const room = this.getMainRoom();
        const textStyle: TextStyle = { color: "white", font: 0.5, align: "left" };
        let offset = 7;

        for (const option of options) {
            const {
                estimatedEnergyWorkRate,
                requestedEnergyUsagePercentage,
                actualEnergyUsagePercentage,
                allowedEnergyWorkRate
            } = option.energyTracking;
            if (estimatedEnergyWorkRate || requestedEnergyUsagePercentage || actualEnergyUsagePercentage) {
                room.visual.text(
                    `${option.systemName} - Energy Usage/Allowed: ${estimatedEnergyWorkRate.toFixed(
                        2
                    )}/${allowedEnergyWorkRate.toFixed(
                        2
                    )}, Actual/Requested Percent: ${actualEnergyUsagePercentage.toFixed(
                        2
                    )}/${requestedEnergyUsagePercentage.toFixed(2)}`,
                    3,
                    offset,
                    textStyle
                );
                offset++;
            }
        }
    }

    public manageEnergyProductionConsumption(): void {
        this.colony.energyManagement.estimatedEnergyProductionRate =
            this.getTotalEstimatedEnergyconsumptionProductionRate("harvester");
        this.colony.energyManagement.totalEnergyUsagePercentageAllowed = 0.8;
        this.setEnergyUsageMod();
        this.manageEnergySystem(this.colony.upgradeManagement.upgraderEnergy, "upgrader");
        this.manageEnergySystem(this.colony.builderManagement.builderEnergy, "builder");
    }

    public manageEnergySystem(energyTracking: EnergyUsageTracking, role: string): void {
        energyTracking.estimatedEnergyWorkRate = this.getTotalEstimatedEnergyconsumptionProductionRate(role);
        energyTracking.actualEnergyUsagePercentage =
            energyTracking.requestedEnergyUsagePercentage * this.colony.energyManagement.energyUsageModifier;
        energyTracking.allowedEnergyWorkRate =
            this.colony.energyManagement.estimatedEnergyProductionRate * energyTracking.actualEnergyUsagePercentage;
    }

    public getTotalEstimatedEnergyconsumptionProductionRate(role: string): number {
        let totalEnergyConsumptionProductionRate = 0;
        const creeps = this.getCreeps().filter(x => x.memory.role === role);

        creeps.forEach(creep => {
            totalEnergyConsumptionProductionRate += creep.memory.averageEnergyConsumptionProductionPerTick;
        });

        return totalEnergyConsumptionProductionRate;
    }

    public setEnergyUsageMod(): void {
        const systems = this.getEnergyTrackingSystems();
        let totalPercentEnergyRequested = 0;
        systems.forEach(x => {
            totalPercentEnergyRequested += x.energyTracking.requestedEnergyUsagePercentage;
        });
        totalPercentEnergyRequested = totalPercentEnergyRequested === 0 ? 1 : totalPercentEnergyRequested;

        const mod = this.colony.energyManagement.totalEnergyUsagePercentageAllowed / totalPercentEnergyRequested;
        this.colony.energyManagement.energyUsageModifier = mod;
    }

    public getCreeps(): Creep[] {
        const creeps: Creep[] = [];
        for (const name in this.colony.creeps) {
            const creepData = this.colony.creeps[name];
            if (!creepData.id) {
                continue;
            }
            const creep = Game.getObjectById<Creep>(creepData.id);
            if (creep) {
                creeps.push(creep);
            }
        }
        return creeps;
    }

    public getSpawnQueue(): SpawnRequest[] {
        if (!this.colony.spawnQueue) {
            this.colony.spawnQueue = [];
        }
        return this.colony.spawnQueue;
    }

    public getColonyCreeps(): ColonyCreeps {
        if (!this.colony.creeps) {
            this.colony.creeps = {};
        }
        return this.colony.creeps;
    }

    private creepManager() {
        for (const name in this.colony.creeps) {
            const creepData = this.colony.creeps[name];
            if (!creepData.id) {
                continue;
            }
            const creep = Game.getObjectById<Creep>(creepData.id);
            if (!creep) {
                delete this.colony.creeps[name];
                continue;
            }
        }
    }

    private creepSpawnManager() {
        const spawn = this.getMainSpawn();
        if (!spawn || spawn.spawning) {
            return;
        }

        const spawnQueue = this.getSpawnQueue();
        if (spawnQueue.length === 0) {
            return;
        }

        const request = spawnQueue[0];
        const { memory, body } = request;
        const creepData = this.getCreepData(memory.name);
        if (!creepData) {
            console.log(`colony | could not get creep data for ${memory.name}}`);
        } else {
            if (creepData.status === CreepStatus.SPAWNING) {
                creepData.status = CreepStatus.IDLE;
                spawnQueue.splice(0, 1);
            } else {
                const status = spawn.spawnCreep(body, memory.name, { memory });
                if (status === OK) {
                    creepData.status = CreepStatus.SPAWNING;
                } else if (status === ERR_NAME_EXISTS) {
                    // this should take care of if a name already exists, it goes to the next spawn
                    console.log(
                        `colony ${this.colony.id} | spawn skipping creep since name already exists: ${memory.name}`
                    );
                    spawnQueue.splice(0, 1);
                } else if (status !== ERR_NOT_ENOUGH_ENERGY) {
                    console.log(`spawn status error: ${status}`);
                }
            }
        }
    }

    public createMiner(sourceId: string, energy: number): string {
        let numberOfParts = Math.floor(energy / 100);

        if (numberOfParts > 7) {
            numberOfParts = 7;
        } else if (numberOfParts <= 2) {
            numberOfParts = 3;
        }

        const body: BodyPartConstant[] = [];
        for (let i = 0; i < numberOfParts - 2; i++) {
            body.push(WORK);
        }
        body.push(MOVE);
        body.push(MOVE);

        const name = this.addToSpawnCreepQueue(body, {
            role: "miner",
            workTargetId: sourceId,
            averageEnergyConsumptionProductionPerTick: 0
        });
        return name;
    }

    public addToSpawnCreepQueue(body: BodyPartConstant[], additionalMemory: AddCreepToQueueOptions): string {
        const memory: CreepMemory = {
            ...additionalMemory,
            name: `${this.colony.id}-${additionalMemory.role}-${this.colony.spawnIndex++}`,
            colonyId: this.colony.id,
            working: false,
            movementSystem: MovementSystem.createMovementSystem(this.getMainSpawn().pos),
            workDuration: additionalMemory?.workDuration ? additionalMemory?.workDuration : 5
        };
        this.getColonyCreeps()[memory.name] = {
            name: memory.name,
            status: CreepStatus.SPAWN_QUEUE
        };
        this.getSpawnQueue().push({ body, memory });
        return memory.name;
    }

    private initialSetup() {
        this.setDesiredScreepCount("harvester", 2);

        // setup main room

        const room = this.getMainRoom();
        this.colony.rooms.push({
            name: room.name,
            isMain: true,
            alertLevel: 0
        });

        // Find Sources
        const sources = room.find(FIND_SOURCES);

        sources.forEach(source => {
            this.colony.energyManagement.sources.push({
                accessCount: 1,
                sourceId: source.id,
                position: source.pos
            });
        });

        // create first container
        const spawn = this.getMainSpawn();
        const pos = new RoomPosition(spawn.pos.x + 2, spawn.pos.y, spawn.pos.roomName);
        room.createConstructionSite(pos, STRUCTURE_CONTAINER);
        return true;
    }

    public getScreepRoom(name: string): RoomData | undefined {
        return this.colony.rooms.find(x => x.name === name);
    }

    public getMainRoom(): Room {
        return Game.rooms[this.colony.id];
    }

    public getMainSpawn(): StructureSpawn {
        const spawn = Game.getObjectById<StructureSpawn>(this.colony.mainSpawnId);
        if (!spawn) {
            throw new Error(`Could not find main spawn "${this.colony.mainSpawnId}" for ${this.colony.id}`);
        }
        return spawn;
    }

    public getCreepData(name: string): CreepData | undefined {
        return this.getColonyCreeps()[name];
    }

    public getId(): string {
        return this.colony.id;
    }

    public setDesiredScreepCount(role: string, amount: number): void {
        this.checkCreepCount(role);
        this.colony.screepCount[role].desired = amount;
    }

    private checkCreepCount(role: string) {
        if (!this.colony.screepCount) {
            this.colony.screepCount = {};
        }

        if (!this.colony.screepCount[role]) {
            this.colony.screepCount[role] = {
                spawning: 0,
                count: 0,
                desired: 0
            };
        }
    }
}

export interface ColonyCreeps {
    [name: string]: CreepData;
}

interface EnergyTrackingSystem {
    systemName: string;
    energyTracking: EnergyUsageTracking;
}
