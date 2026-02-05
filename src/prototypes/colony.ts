import { CreepRole, CreepStatus } from "./creep";
import { ConstructionManager } from "../managers/construction-manager";
import { RoadManager } from "../managers/road-manager";

import { BaseSystem } from "systems/base-system";
import { BuilderSystem } from "./../systems/builder-system";
import { DefenseSystem } from "./../systems/defense-system";
import { EnergySystem } from "./../systems/energy-system";
import { InfrastructureSystem } from "../systems/infrastructure-system";
import { Movement } from "infrastructure/movement";
import { Spawning } from "infrastructure/spawning";
import { UpgradeSystem } from "./../systems/upgrade-system";
import { GoapSystem } from "../systems/goap-system";

export interface Systems {
    energy: EnergySystem;
    defense: DefenseSystem;
    infrastructure: InfrastructureSystem;
    upgrade: UpgradeSystem;
    builder: BuilderSystem;
    goap: GoapSystem;
}

function getSystems(colony: ColonyManager): Systems {
    return {
        energy: new EnergySystem(colony),
        defense: new DefenseSystem(colony),
        infrastructure: new InfrastructureSystem(colony),
        upgrade: new UpgradeSystem(colony),
        builder: new BuilderSystem(colony),
        goap: new GoapSystem(colony),
    };
}

export interface ColonyManager {
    get colonyInfo(): Colony;
    get systems(): Systems;

    getMainRoom(): Room;
    getMainSpawn(): StructureSpawn;
    getColonyCreeps(): ColonyCreeps;
    getCreepData(name: string): CreepData | undefined;
    getSpawnQueue(): SpawnRequest[];
    addToSpawnCreepQueue(bodyBlueprint: BodyPartConstant[], memoryBlueprint: AddCreepToQueueOptions): string;
    getTotalEstimatedEnergyFlowRate(role: CreepRole): number;
    getCreepCount(role: CreepRole): number;
    /** List version of systems used in colony. */
    getSystemsList(): BaseSystem[];
    getCreeps(): Creep[];
    removeSpawnRequest(name: string): void;
    constructionManager: ConstructionManager;
    roadManager: RoadManager;
    getPrimaryStorage(): StructureStorage | StructureContainer | undefined;
}

export class ColonyManagerImpl implements ColonyManager {
    public colonyInfo: Colony;
    public systems = getSystems(this);
    public constructionManager: ConstructionManager;
    public roadManager: RoadManager;

    public constructor(colony: Colony) {
        this.colonyInfo = colony;
        this.constructionManager = new ConstructionManager(this);
        this.roadManager = new RoadManager(this);
    }

    public run(): void {
        if (!this.getMainRoom()) {
            console.log(`No vision of colony room ${this.colonyInfo.id}, removing from memory...`);
            delete Memory.colonies[this.colonyInfo.id];
            return;
        }
        const systems = this.getSystemsList();
        const spawnManager = new Spawning(this);

        if (!this.colonyInfo.setupComplete) {
            this.colonyInfo.setupComplete = this.initialSetup();
            systems.forEach(x => x.onStart());
        }

        if (!this.colonyInfo.level) {
            this.colonyInfo.level = this.getMainRoom().controller?.level || 0;
        }

        this.manageEnergyProductionConsumption();

        if (this.shouldUpdate()) {
            systems.forEach(x => x.updateProfiles());
        }

        spawnManager.run();
        systems.forEach(x => x.run());
        this.constructionManager.run();

        this.creepManager();
        this.visualizeStats();
    }

    public getSystemsList(): BaseSystem[] {
        const s = this.systems as unknown as { [k: string]: BaseSystem };
        const systems = [];
        for (const key in s) {
            systems.push(s[key]);
        }
        return systems;
    }

    private shouldUpdate(): boolean {
        if (!this.colonyInfo.nextUpdate || this.colonyInfo.nextUpdate < Game.time) {
            this.colonyInfo.nextUpdate = Game.time + 10;
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
            storedEnergyPercent,
            totalEnergyUsagePercentageAllowed: totalEnergyUsagePercentage,
        } = this.systems.energy.systemInfo;

        const gross = (this.systems.energy.systemInfo as any).grossProduction || 0;
        const upkeep = (this.systems.energy.systemInfo as any).upkeep || 0;

        room.visual.text(
            `Net Energy: ${estimatedEnergyProductionRate.toFixed(2)} (Gross: ${gross.toFixed(2)} - Upkeep: ${upkeep.toFixed(2)})`,
            3,
            6,
            textStyle,
        );
        room.visual.text(
            `Energy Usage Percent: ${totalEnergyUsagePercentage.toFixed(2)}    Energy Stored Percent: ${storedEnergyPercent.toFixed(2)}`,
            3,
            7,
            textStyle,
        );

        const visualizeSystems = this.getEnergyTrackingSystems();
        this.visualizeSystems(visualizeSystems);
        this.visualizeSpawnQueue();
        this.visualizeGoapStats();
    }

    private getEnergyTrackingSystems(): EnergyTrackingSystem[] {
        const systems: EnergyTrackingSystem[] = [];
        const s = this.systems as unknown as { [k: string]: BaseSystem };

        for (const key in s) {
            const system = s[key];
            if (
                !system.energyUsageTracking.requestedEnergyUsageWeight &&
                system.energyUsageTracking.estimatedEnergyWorkRate === 0
            ) {
                continue;
            }

            systems.push({
                systemName: key,
                energyTracking: system.energyUsageTracking,
            });
        }
        return systems;
    }

    private visualizeSystems(options: EnergyTrackingSystem[]): void {
        const room = this.getMainRoom();
        const textStyle: TextStyle = { color: "white", font: 0.5, align: "left" };
        let offset = 8; // Adjusted offset since we added a line

        let totalRequestedWeight = 0;
        options.forEach(o => (totalRequestedWeight += o.energyTracking.requestedEnergyUsageWeight));

        room.visual.text(`Total Requested Weight: ${totalRequestedWeight.toFixed(2)}`, 3, offset++, {
            color: "#cccccc",
            font: 0.5,
            align: "left",
        });

        for (const option of options) {
            const {
                estimatedEnergyWorkRate,
                requestedEnergyUsageWeight: requestedEnergyUsagePercentage,
                actualEnergyUsagePercentage,
                allowedEnergyWorkRate,
            } = option.energyTracking;

            if (estimatedEnergyWorkRate || requestedEnergyUsagePercentage || actualEnergyUsagePercentage) {
                const y = offset;
                // System Name
                room.visual.text(`${option.systemName}`, 3, y, textStyle);

                // Draw bar for usage/allowed
                const barWidth = 10;
                const usagePercent =
                    allowedEnergyWorkRate > 0 ? Math.min(estimatedEnergyWorkRate / allowedEnergyWorkRate, 1) : 0;
                const barColor = estimatedEnergyWorkRate > allowedEnergyWorkRate ? "#ff0000" : "#00ff00";

                room.visual.rect(10, y - 0.6, barWidth, 0.6, { fill: "#333333", opacity: 0.5 });
                if (usagePercent > 0) {
                    room.visual.rect(10, y - 0.6, barWidth * usagePercent, 0.6, { fill: barColor, opacity: 0.8 });
                }

                // Stats text
                room.visual.text(
                    `Use/Allow: ${estimatedEnergyWorkRate.toFixed(1)}/${allowedEnergyWorkRate.toFixed(1)}  ` +
                        `Req/Act %: ${(requestedEnergyUsagePercentage * 100).toFixed(0)}%/${(actualEnergyUsagePercentage * 100).toFixed(0)}%`,
                    10 + barWidth + 1,
                    y,
                    { ...textStyle, color: "#aaaaaa" },
                );

                offset++;
            }
        }
    }

    private visualizeSpawnQueue(): void {
        const room = this.getMainRoom();
        const queue = this.getSpawnQueue();
        const x = 35;
        let y = 3;

        room.visual.text("Spawn Queue:", x, y++, { align: "left", color: "#aaaaaa", opacity: 0.8 });

        if (queue.length === 0) {
            room.visual.text("- Empty -", x, y++, { align: "left", font: 0.5, color: "#666666" });
        }

        for (let i = 0; i < Math.min(queue.length, 10); i++) {
            const item = queue[i];
            room.visual.text(`[${item.priority}] ${item.memory.role}`, x, y++, {
                align: "left",
                font: 0.5,
                opacity: 0.8,
            });
        }
    }

    private visualizeGoapStats(): void {
        const room = this.getMainRoom();
        const goap = this.systems.goap;
        const x = 3;
        let y = 15;

        room.visual.text("GOAP State:", x, y++, { align: "left", color: "#aaaaaa", opacity: 0.8 });
        const goal = goap.activeGoal;
        if (goal) {
            room.visual.text(`Goal: ${goal.name}`, x, y++, { align: "left", font: 0.7, color: "#00ff00" });
            room.visual.text(`Priority: ${goal.priority}`, x, y++, { align: "left", font: 0.5, color: "#cccccc" });
        } else {
            room.visual.text(`Goal: None`, x, y++, { align: "left", font: 0.7, color: "#ff6666" });
        }

        const plan = goap.activePlan;
        if (plan && plan.length > 0) {
            y += 0.5;
            room.visual.text(`Current Plan:`, x, y++, { align: "left", font: 0.6, color: "#aaaaaa" });
            plan.forEach((action, idx) => {
                let color = "#ffffff";
                if (idx === 0) color = "#ffff00"; // Highlight current action
                room.visual.text(`${idx + 1}. ${action.name}`, x + 0.5, y++, {
                    align: "left",
                    font: 0.5,
                    color,
                });
            });
        }
    }

    public manageEnergyProductionConsumption(): void {
        const gross = this.systems.energy.getTheoreticalGrossProduction();
        let upkeep = 0;

        this.systems.energy
            .getSpawnerProfilesList()
            .forEach(x => (upkeep += (x.spawnCostPerTick || 0) * (x.desiredAmount || 0)));

        this.systems.energy.systemInfo.estimatedEnergyProductionRate = gross - upkeep;
        (this.systems.energy.systemInfo as any).grossProduction = gross;
        (this.systems.energy.systemInfo as any).upkeep = upkeep;

        const storedEnergyPercent = this.getStoredEnergyPercent();
        if (storedEnergyPercent > 0.9) {
            this.systems.energy.systemInfo.totalEnergyUsagePercentageAllowed = 1.5;
        } else if (storedEnergyPercent > 0.8) {
            this.systems.energy.systemInfo.totalEnergyUsagePercentageAllowed = 1;
        } else {
            this.systems.energy.systemInfo.totalEnergyUsagePercentageAllowed = 0.8;
        }
        this.systems.energy.systemInfo.storedEnergyPercent = storedEnergyPercent;
        this.setEnergyUsageMod();

        const s = this.systems as unknown as { [k: string]: BaseSystem };

        for (const key in s) {
            if (key === "energy") {
                continue;
            }
            const system = s[key];
            this.manageEnergySystem(system);
        }
    }

    public getStoredEnergyPercent(): number {
        if (!this.colonyInfo.containerId) {
            this.colonyInfo.containerId =
                this.getMainSpawn().pos.findClosestByRange<StructureContainer>(FIND_MY_STRUCTURES)?.id;
        }
        if (!this.colonyInfo.containerId) {
            return 0;
        }

        const container = Game.getObjectById<StructureContainer>(this.colonyInfo.containerId);
        if (!container) {
            return 0;
        }

        let energy = container.store[RESOURCE_ENERGY];
        let capacity = container.store.getCapacity(RESOURCE_ENERGY);

        if (this.getMainRoom().storage) {
            energy += this.getMainRoom().storage?.store[RESOURCE_ENERGY] || 0;
            capacity += this.getMainRoom().storage?.store?.getCapacity(RESOURCE_ENERGY) || 0;
        }

        return energy / capacity;
    }

    public manageEnergySystem(system: BaseSystem): void {
        const roles = system.getRolesToTrackEnergy();
        const { energyUsageTracking: energyTracking } = system;

        energyTracking.estimatedEnergyWorkRate = 0;

        roles.forEach(x => (energyTracking.estimatedEnergyWorkRate += this.getTotalEstimatedEnergyFlowRate(x)));
        system
            .getSpawnerProfilesList()
            .forEach(
                x => (energyTracking.estimatedEnergyWorkRate += (x.spawnCostPerTick || 0) * (x.desiredAmount || 0)),
            );

        energyTracking.actualEnergyUsagePercentage =
            energyTracking.requestedEnergyUsageWeight * this.systems.energy.systemInfo.energyUsageModifier;
        energyTracking.allowedEnergyWorkRate =
            this.systems.energy.systemInfo.estimatedEnergyProductionRate * energyTracking.actualEnergyUsagePercentage;
    }

    public getTotalEstimatedEnergyFlowRate(role: string): number {
        let totalEnergyConsumptionProductionRate = 0;
        const creeps = this.getCreeps().filter(x => x.memory.role === role);

        creeps.forEach(creep => {
            totalEnergyConsumptionProductionRate += creep.memory.averageEnergyConsumptionProductionPerTick || 0;
        });

        return totalEnergyConsumptionProductionRate;
    }

    public getCreepCount(role: CreepRole): number {
        const aliveCount = this.getCreeps().filter(x => x.memory.role === role).length;
        const spawnQueueCount = this.getSpawnQueue().filter(x => x.memory.role === role).length;
        return aliveCount + spawnQueueCount;
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

    public addToSpawnCreepQueue(body: BodyPartConstant[], additionalMemory: AddCreepToQueueOptions): string {
        const memory: CreepMemory = {
            ...additionalMemory,
            name: this.createUniqueCreepName(`${this.colonyInfo.id}-${additionalMemory.role}`),
            colonyId: this.colonyInfo.id,
            working: false,
            movementSystem: Movement.createMovementSystem(this.getMainSpawn().pos),
            workDuration: additionalMemory?.workDuration ? additionalMemory?.workDuration : 5,
        };
        this.getColonyCreeps()[memory.name] = {
            name: memory.name,
            status: CreepStatus.SPAWN_QUEUE,
        };
        const priority = additionalMemory.priority !== undefined ? additionalMemory.priority : 0;
        this.getSpawnQueue().push({ body, memory, priority });
        this.getSpawnQueue().sort((a, b) => b.priority - a.priority);
        return memory.name;
    }

    public updateSpawnRequestPriority(name: string, priority: number): void {
        const queue = this.getSpawnQueue();
        const request = queue.find(x => x.memory.name === name);
        if (request) {
            request.priority = priority;
            queue.sort((a, b) => b.priority - a.priority);
        }
    }

    public removeSpawnRequest(name: string): void {
        const queue = this.getSpawnQueue();
        const index = queue.findIndex(x => x.memory.name === name);
        if (index !== -1) {
            queue.splice(index, 1);
            delete this.getColonyCreeps()[name];
        }
    }

    private createUniqueCreepName(name: string): string {
        let index = 1;
        while (index < 1000) {
            const newName = `${name}-${index}`;
            if (!(newName in Game.creeps) && !(newName in this.getColonyCreeps())) {
                return newName;
            }
            index++;
        }
        throw new Error(`Could not create unique creep name for ${name}`);
    }

    private initialSetup() {
        // setup main room
        const room = this.getMainRoom();
        this.colonyInfo.rooms.push({
            name: room.name,
            isMain: true,
            alertLevel: 0,
        });
        // Check for existing creeps that belong to this colony (recovery from memory wipe)
        this.scanForCreeps();

        return true;
    }

    private scanForCreeps(): void {
        console.log(`Scanning for orphaned creeps in colony ${this.colonyInfo.id}...`);
        const colonyCreeps = this.getColonyCreeps();
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.colonyId === this.colonyInfo.id) {
                if (!colonyCreeps[name]) {
                    console.log(`Adopting orphaned creep: ${name}`);
                    colonyCreeps[name] = {
                        name,
                        id: creep.id,
                        status: CreepStatus.WORKING, // Assume working, systems will sort it out
                    };
                }
            }
        }
    }

    public getScreepRoom(name: string): RoomData | undefined {
        return this.colonyInfo.rooms.find(x => x.name === name);
    }

    public getMainRoom(): Room {
        return Game.rooms[this.colonyInfo.id];
    }

    public getMainSpawn(): StructureSpawn {
        let spawn = Game.getObjectById(this.colonyInfo.mainSpawnId);
        if (!spawn) {
            console.warn(`Colony ${this.colonyInfo.id} does not have a main spawn set, resetting spawn.`);
            const mainRoom = this.getMainRoom();
            spawn = mainRoom.find(FIND_MY_SPAWNS)[0];
            this.colonyInfo.mainSpawnId = spawn.id;
        }
        return spawn;
    }

    public getCreepData(name: string): CreepData | undefined {
        return this.getColonyCreeps()[name];
    }

    public getId(): string {
        return this.colonyInfo.id;
    }

    public getPrimaryStorage(): StructureStorage | StructureContainer | undefined {
        const room = this.getMainRoom();
        if (room.storage && room.storage.isActive()) {
            return room.storage;
        }

        if (this.colonyInfo.containerId) {
            const container = Game.getObjectById<StructureContainer>(this.colonyInfo.containerId);
            if (container) {
                return container;
            }
        }
        return undefined;
    }
}

export interface ColonyCreeps {
    [name: string]: CreepData;
}

interface EnergyTrackingSystem {
    systemName: string;
    energyTracking: EnergyUsageTracking;
}
