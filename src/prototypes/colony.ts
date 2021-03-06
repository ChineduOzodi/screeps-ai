import { DefenceSystem } from './../systems/defence-system';
import { BuilderSystem } from './../systems/builder-system';
import { UpgradeSystem } from './../systems/upgrade-system';
import { EnergySystem } from './../systems/energy-system';
import { CreepStatus } from "./creep";

export interface Colony {
    id: string;
    spawnIndex: number;
    setupComplete?: boolean;
    spawnEnergy: number;
    screepCount: ScreepCount;
    creeps: ColonyCreeps;
    rooms: RoomData[];
    mainSpawnId: string;
    spawnQueue: SpawnRequest[];
    stats: ColonyStats;
    energyManagement: ColonyEnergyManagement;
    upgradeManagement: ColonyUpgradeManagement;
    builderManagement: ColonyBuilderManagement;
    defenceManagement: ColonyDefenceManagement;
}

export class ColonyExtras {
    colony: Colony;
    constructor(colony: Colony) {
        this.colony = colony;
    }

    run() {
        if (!this.colony.setupComplete) {
            this.colony.setupComplete = this.initialSetup();
        }

        this.creepSpawnManager();
        this.manageEnergyProductionConsumption();

        DefenceSystem.run(this);
        EnergySystem.run(this);
        UpgradeSystem.run(this);
        BuilderSystem.run(this);

        this.creepManager();
        this.visualizeStats();
    }

    visualizeStats() {
        const room = this.getMainRoom();
        room.visual.text(`Colony: ${this.colony.id}`, 3, 5, { color: 'white', font: 1, align: 'left' });

        const textStyle: TextStyle = { color: 'white', font: 0.5, align: 'left' };
        const { estimatedEnergyProductionRate, totalEnergyUsagePercentageAllowed: totalEnergyUsagePercentage } = this.colony.energyManagement;
        room.visual.text(`Energy Production: ${estimatedEnergyProductionRate.toFixed(2)}, Energy Usage Percent: ${totalEnergyUsagePercentage.toFixed(2)}`, 3, 6, textStyle);

        const visualizeSystems = this.getEnergyTrackingSystems();
        this.visualizeSystems(visualizeSystems);
    }

    getEnergyTrackingSystems() {
        const systems: EnergyTrackingSystem[] = [
            {
                systemName: 'Upgrade System',
                energyTracking: this.colony.upgradeManagement.upgraderEnergy
            },
            {
                systemName: 'Builder System',
                energyTracking: this.colony.builderManagement.builderEnergy
            }
        ];
        return systems;
    }

    visualizeSystems(options: EnergyTrackingSystem[]) {
        const room = this.getMainRoom();
        const textStyle: TextStyle = { color: 'white', font: 0.5, align: 'left' };
        let offset = 7;

        for (const option of options) {
            const { estimatedEnergyWorkRate, requestedEnergyUsagePercentage, actualEnergyUsagePercentage, allowedEnergyWorkRate } = option.energyTracking;
            if (estimatedEnergyWorkRate || requestedEnergyUsagePercentage || actualEnergyUsagePercentage) {
                room.visual.text(`${option.systemName} - Energy Usage/Allowed: ${estimatedEnergyWorkRate.toFixed(2)}/${allowedEnergyWorkRate.toFixed(2)}, Actual/Requested Percent: ${actualEnergyUsagePercentage.toFixed(2)}/${requestedEnergyUsagePercentage.toFixed(2)}`, 3, offset, textStyle);
                offset++;
            }
        }

    }

    manageEnergyProductionConsumption() {
        this.colony.energyManagement.estimatedEnergyProductionRate = this.getTotalEstimatedEnergyconsumptionProductionRate('harvester');
        this.colony.energyManagement.totalEnergyUsagePercentageAllowed = 0.8;
        this.setEnergyUsageMod();
        this.manageEnergySystem(this.colony.upgradeManagement.upgraderEnergy, 'upgrader');
        this.manageEnergySystem(this.colony.builderManagement.builderEnergy, 'builder');
    }

    manageEnergySystem(energyTracking: EnergyUsageTracking, role: string) {
        energyTracking.estimatedEnergyWorkRate = this.getTotalEstimatedEnergyconsumptionProductionRate(role);
        energyTracking.actualEnergyUsagePercentage = energyTracking.requestedEnergyUsagePercentage * this.colony.energyManagement.energyUsageModifier;
        energyTracking.allowedEnergyWorkRate = this.colony.energyManagement.estimatedEnergyProductionRate * energyTracking.actualEnergyUsagePercentage;
    }

    getTotalEstimatedEnergyconsumptionProductionRate(role: string) {
        let totalEnergyConsumptionProductionRate = 0;
        const creeps = this.getCreeps().filter(x => x.memory.role === role);

        creeps.forEach(creep => {
            totalEnergyConsumptionProductionRate += creep.memory.averageEnergyConsumptionProductionPerTick;
        });

        return totalEnergyConsumptionProductionRate;
    }

    setEnergyUsageMod() {
        const systems = this.getEnergyTrackingSystems();
        let totalPercentEnergyRequested = 0;
        systems.forEach(x => {
            totalPercentEnergyRequested += x.energyTracking.requestedEnergyUsagePercentage;
        });
        totalPercentEnergyRequested = totalPercentEnergyRequested === 0 ? 1 : totalPercentEnergyRequested;

        let mod = this.colony.energyManagement.totalEnergyUsagePercentageAllowed / totalPercentEnergyRequested;
        this.colony.energyManagement.energyUsageModifier = mod;
    }

    getCreeps() {
        const creeps: Creep[] = [];
        for (const name in this.colony.creeps) {
            const creepData = this.colony.creeps[name];
            if (!creepData.id) {
                continue
            }
            const creep = Game.getObjectById<Creep>(creepData.id);
            if (creep) {
                creeps.push(creep);
            }
        }
        return creeps;
    }

    private creepManager() {
        for (const name in this.colony.creeps) {
            const creepData = this.colony.creeps[name];
            if (!creepData.id) {
                continue
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

        if (this.colony.spawnQueue.length == 0) {
            return;
        }

        const request = this.colony.spawnQueue[0];
        const { memory, body } = request;
        const creepData = this.getCreepData(memory.name);
        if (creepData.status === CreepStatus.SPAWNING) {
            creepData.status = CreepStatus.IDLE;
            this.colony.spawnQueue.splice(0, 1);
        } else {
            const status = spawn.spawnCreep(body, memory.name, { memory });
            if (status === 0) {
                creepData.status = CreepStatus.SPAWNING;
            }
        }
    }

    createMiner(sourceId: string, energy: number) {
        let numberOfParts = Math.floor((energy / 100));

        if (numberOfParts > 7) {
            numberOfParts = 7;
        }
        else if (numberOfParts <= 2) {
            numberOfParts = 3;
        }

        const body: BodyPartConstant[] = [];
        for (let i = 0; i < numberOfParts - 2; i++) {
            body.push(WORK);
        }
        body.push(MOVE);
        body.push(MOVE);

        const name = this.addToSpawnCreepQueue(body, {
            role: 'miner',
            workTargetId: sourceId,
            averageEnergyConsumptionProductionPerTick: 0
        });
        return name;
    }

    addToSpawnCreepQueue(body: BodyPartConstant[], additionalMemory: AddCreepToQueueOptions) {
        const memory: CreepMemory = {
            ...additionalMemory,
            name: `${this.colony.id}-${additionalMemory.role}-${this.colony.spawnIndex++}`,
            colonyId: this.colony.id,
            working: false,
            movementSystem: {
                previousPos: this.getMainSpawn().pos,
                idle: 0,
                pathStuck: 0,
                idleReserved: false,
            },
            workDuration: additionalMemory?.workDuration ? additionalMemory?.workDuration : 5
        }
        this.colony.creeps[memory.name] = {
            name: memory.name,
            status: CreepStatus.SPAWN_QUEUE
        }
        this.colony.spawnQueue.push({ body, memory });
        return memory.name;
    }

    private initialSetup() {
        this.setDesiredScreepCount('harvester', 2);

        //setup main room

        const room = this.getMainRoom();
        this.colony.rooms.push({
            name: room.name,
            isMain: true,
            alertLevel: 0
        });

        //Find Sources
        const sources = room.find(FIND_SOURCES);

        sources.forEach(source => {
            this.colony.energyManagement.sources.push({
                sourceId: source.id,
                position: source.pos,
            });
        });

        // create first container
        const spawn = this.getMainSpawn();
        const pos = new RoomPosition(spawn.pos.x + 2, spawn.pos.y, spawn.pos.roomName);
        room.createConstructionSite(pos, STRUCTURE_CONTAINER);
        return true;
    }

    getScreepRoom(name: string) {
        return this.colony.rooms.find(x => x.name === name);
    }

    getMainRoom() {
        return Game.rooms[this.colony.id];
    }

    getMainSpawn() {
        const spawn = Game.getObjectById<StructureSpawn>(this.colony.mainSpawnId);
        if (!spawn) {
            throw new Error(`Could not find main spawn "${this.colony.mainSpawnId}" for ${this.colony.id}`);
        }
        return spawn;
    }

    getCreepData(name: string) {
        return this.colony.creeps[name];
    }

    getId() {
        return this.colony.id;
    }

    setDesiredScreepCount(role: string, number: number) {
        this.checkCreepCount(role);
        this.colony.screepCount[role].desired = number;
    }

    private checkCreepCount(role: string) {
        if (!this.colony.screepCount) {
            this.colony.screepCount = {};
        }

        if (!this.colony.screepCount[role]) {
            this.colony.screepCount[role] = {
                "spawning": 0,
                "count": 0,
                "desired": 0
            };
        }
    }
}

export interface ColonyCreeps {
    [name: string]: CreepData;
}

interface EnergyTrackingSystem {
    systemName: string,
    energyTracking: EnergyUsageTracking;
}