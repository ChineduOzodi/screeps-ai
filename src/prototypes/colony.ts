import { BuilderSystem } from "./../systems/builder-system";
import { InfrastructureSystem } from "../systems/infrastructure-system";
import { CreepStatus } from "./creep";
import { DefenseSystem } from "./../systems/defense-system";
import { EnergySystem } from "./../systems/energy-system";
import { MovementSystem } from "systems/movement-system";
import { UpgradeSystem } from "./../systems/upgrade-system";
import { BaseSystem } from "systems/base-system";

function getSystems(colony: ColonyManager) {
    return {
        "energy": new EnergySystem(colony),
        "defense": new DefenseSystem(colony),
        "infrastructure": new InfrastructureSystem(colony),
        "upgrade": new UpgradeSystem(colony),
        "builder": new BuilderSystem(colony),
    }
}

export interface ColonyManager {
    get colonyInfo(): Colony;

    getMainRoom(): Room;
    getMainSpawn(): StructureSpawn;
    getColonyCreeps(): ColonyCreeps;
    addToSpawnCreepQueue(bodyBlueprint: BodyPartConstant[], memoryBlueprint: AddCreepToQueueOptions): string;
    getTotalEstimatedEnergyFlowRate(role: string): number;
}

export class ColonyManagerImpl implements ColonyManager {
    public colonyInfo: Colony;
    public systems = getSystems(this);

    public constructor(colony: Colony) {
        this.colonyInfo = colony;
    }

    public run(): void {
        const systems = this.getSystemsList();

        if (!this.colonyInfo.setupComplete) {
            this.colonyInfo.setupComplete = this.initialSetup();
            systems.forEach(x => x.onStart());
        }

        this.creepSpawnManager();
        this.manageEnergyProductionConsumption();

        if (this.shouldUpdate()) {
            systems.forEach(x => x.updateProfiles());
        }

        systems.forEach(x => x.run());

        this.creepManager();
        this.visualizeStats();
    }

    private getSystemsList(): BaseSystem[] {
        const s = (this.systems as { [k: string]: BaseSystem });
        const systems = [];
        for (const key in s) {
            systems.push(s[key]);
        }
        return systems;
    }

    private shouldUpdate(): boolean {
        if (!this.colonyInfo.nextUpdate || this.colonyInfo.nextUpdate < Game.time) {
            this.colonyInfo.nextUpdate = Game.time + 500;
            return true;
        }
        return false;
    }

    public visualizeStats(): void {
        const room = this.getMainRoom();
        room.visual.text(`Colony: ${this.colonyInfo.id}`, 3, 5, { color: "white", font: 1, align: "left" });

        const textStyle: TextStyle = { color: "white", font: 0.5, align: "left" };
        const {
            estimatedEnergyProductionRate,
            totalEnergyUsagePercentageAllowed: totalEnergyUsagePercentage,
        } = this.systems["energy"].systemInfo;
        room.visual.text(
            `Energy Production Estimate: ${estimatedEnergyProductionRate.toFixed(2)}         Energy Usage Percent: ${totalEnergyUsagePercentage.toFixed(2)}`,
            3,
            6,
            textStyle
        );

        const visualizeSystems = this.getEnergyTrackingSystems();
        this.visualizeSystems(visualizeSystems);
    }

    private getEnergyTrackingSystems(): EnergyTrackingSystem[] {
        const systems: EnergyTrackingSystem[] = [];
        const s = (this.systems as { [k: string]: BaseSystem });

        for (const key in s) {

            const system = s[key];
            if (!system.energyUsageTracking.requestedEnergyUsageWeight) {
                continue;
            }

            systems.push({
                systemName: key,
                energyTracking: system.energyUsageTracking
            })
        }
        return systems;
    }

    private visualizeSystems(options: EnergyTrackingSystem[]): void {
        const room = this.getMainRoom();
        const textStyle: TextStyle = { color: "white", font: 0.5, align: "left" };
        let offset = 7;

        for (const option of options) {
            const {
                estimatedEnergyWorkRate,
                requestedEnergyUsageWeight: requestedEnergyUsagePercentage,
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
        this.systems.energy.systemInfo.estimatedEnergyProductionRate =
            this.getTotalEstimatedEnergyFlowRate("harvester");
        this.systems.energy.systemInfo.totalEnergyUsagePercentageAllowed = 0.8;
        this.setEnergyUsageMod();

        const s = (this.systems as { [k: string]: BaseSystem });

        for (const key in s) {

            const system = s[key];
            if (!system.energyUsageTracking.requestedEnergyUsageWeight) {
                continue;
            }

            this.manageEnergySystem(system.energyUsageTracking, system.getRolesToTrackEnergy());
        }
    }

    public manageEnergySystem(energyTracking: EnergyUsageTracking, roles: string[]): void {
        energyTracking.estimatedEnergyWorkRate = 0;

        roles.forEach( x => energyTracking.estimatedEnergyWorkRate -= this.getTotalEstimatedEnergyFlowRate(x));
        energyTracking.actualEnergyUsagePercentage =
            energyTracking.requestedEnergyUsageWeight * this.systems.energy.systemInfo.energyUsageModifier;
        energyTracking.allowedEnergyWorkRate =
            this.systems.energy.systemInfo.estimatedEnergyProductionRate * energyTracking.actualEnergyUsagePercentage;
    }

    public getTotalEstimatedEnergyFlowRate(role: string): number {
        let totalEnergyConsumptionProductionRate = 0;
        const creeps = this.getCreeps().filter(x => x.memory.role === role);

        creeps.forEach(creep => {
            totalEnergyConsumptionProductionRate += creep.memory.energyTrackingInfo?.average || 0;
        });

        return totalEnergyConsumptionProductionRate;
    }

    public setEnergyUsageMod(): void {
        const systems = this.getEnergyTrackingSystems();
        let totalPercentEnergyRequested = 0;
        systems.forEach(x => {
            totalPercentEnergyRequested += x.energyTracking.requestedEnergyUsageWeight;
        });
        totalPercentEnergyRequested = totalPercentEnergyRequested === 0 ? 1 : totalPercentEnergyRequested;

        const mod = this.systems.energy.systemInfo.totalEnergyUsagePercentageAllowed / totalPercentEnergyRequested;
        this.systems.energy.systemInfo.energyUsageModifier = mod;
    }

    public getCreeps(): Creep[] {
        const creeps: Creep[] = [];
        for (const name in this.colonyInfo.creeps) {
            const creepData = this.colonyInfo.creeps[name];
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
        if (!this.colonyInfo.spawnQueue) {
            this.colonyInfo.spawnQueue = [];
        }
        return this.colonyInfo.spawnQueue;
    }

    public getColonyCreeps(): ColonyCreeps {
        if (!this.colonyInfo.creeps) {
            this.colonyInfo.creeps = {};
        }
        return this.colonyInfo.creeps;
    }

    private creepManager() {
        for (const name in this.colonyInfo.creeps) {
            const creepData = this.colonyInfo.creeps[name];
            if (!creepData.id) {
                continue;
            }
            const creep = Game.getObjectById(creepData.id);
            if (!creep) {
                delete this.colonyInfo.creeps[name];
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
                        `colony ${this.colonyInfo.id} | spawn skipping creep since name already exists: ${memory.name}`
                    );
                    spawnQueue.splice(0, 1);
                } else if (status !== ERR_NOT_ENOUGH_ENERGY) {
                    console.log(`spawn status error: ${status}`);
                }
            }
        }
    }

    // TODO: Move to energy system and it's own class
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
            name: `${this.colonyInfo.id}-${additionalMemory.role}-${this.colonyInfo.spawnIndex++}`,
            colonyId: this.colonyInfo.id,
            working: false,
            movementSystem: MovementSystem.createMovementSystem(this.getMainSpawn().pos),
            workDuration: additionalMemory?.workDuration ? additionalMemory?.workDuration : 5,
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
        this.colonyInfo.rooms.push({
            name: room.name,
            isMain: true,
            alertLevel: 0
        });

        // create first container
        const spawn = this.getMainSpawn();
        const pos = new RoomPosition(spawn.pos.x + 2, spawn.pos.y, spawn.pos.roomName);
        room.createConstructionSite(pos, STRUCTURE_CONTAINER);
        return true;
    }

    public getScreepRoom(name: string): RoomData | undefined {
        return this.colonyInfo.rooms.find(x => x.name === name);
    }

    public getMainRoom(): Room {
        return Game.rooms[this.colonyInfo.id];
    }

    public getMainSpawn(): StructureSpawn {
        const spawn = Game.getObjectById(this.colonyInfo.mainSpawnId);
        if (!spawn) {
            throw new Error(
                `Could not find main spawn "${this.colonyInfo.mainSpawnId}" for ${this.colonyInfo.id}`
            );
        }
        return spawn;
    }

    public getCreepData(name: string): CreepData | undefined {
        return this.getColonyCreeps()[name];
    }

    public getId(): string {
        return this.colonyInfo.id;
    }

    public setDesiredScreepCount(role: string, amount: number): void {
        this.checkCreepCount(role);
        this.colonyInfo.screepCount[role].desired = amount;
    }

    private checkCreepCount(role: string) {
        if (!this.colonyInfo.screepCount) {
            this.colonyInfo.screepCount = {};
        }

        if (!this.colonyInfo.screepCount[role]) {
            this.colonyInfo.screepCount[role] = {
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
