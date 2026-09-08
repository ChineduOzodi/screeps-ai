import { ConstructionManager } from "../managers/construction-manager";
import { LabManager } from "../managers/lab-manager";
import { LinkManager } from "../managers/link-manager";
import { ObserverManager } from "../managers/observer-manager";
import { RoadManager } from "../managers/road-manager";
import { TerminalManager } from "../managers/terminal-manager";

import { BaseSystem, ColonyCreeps, ColonyManager, CreepRole, CreepStatus, Systems } from "./types";
import { BuilderSystem } from "./../systems/builder-system";
import { DefenseSystem } from "./../systems/defense-system";
import { EnergySystem } from "./../systems/energy-system";
import { ExpansionSystem } from "../systems/expansion-system";
import { InfrastructureSystem } from "../systems/infrastructure-system";
import { Movement } from "infrastructure/movement";
import { Spawning } from "infrastructure/spawning";
import { UpgradeSystem } from "./../systems/upgrade-system";
import { CpuBudget } from "utils/cpu-budget";
import { computeEnergyBudget } from "utils/energy-budget";
import { RepairUtils } from "utils/repair-utils";
import { Logger } from "utils/logger";

function getSystems(colony: ColonyManager): Systems {
    return {
        energy: new EnergySystem(colony),
        defense: new DefenseSystem(colony),
        infrastructure: new InfrastructureSystem(colony),
        upgrade: new UpgradeSystem(colony),
        builder: new BuilderSystem(colony),
        expansion: new ExpansionSystem(colony),
    };
}

export class ColonyManagerImpl implements ColonyManager {
    public colonyInfo: Colony;
    public systems = getSystems(this);
    public constructionManager: ConstructionManager;
    public roadManager: RoadManager;
    public linkManager: LinkManager;
    public terminalManager: TerminalManager;
    public labManager: LabManager;
    public observerManager: ObserverManager;

    public constructor(colony: Colony) {
        this.colonyInfo = colony;
        this.constructionManager = new ConstructionManager(this);
        this.roadManager = new RoadManager(this);
        this.linkManager = new LinkManager(this);
        this.terminalManager = new TerminalManager(this);
        this.labManager = new LabManager(this);
        this.observerManager = new ObserverManager(this);
    }

    public get energyManagement(): ColonyEnergyManagement | undefined {
        return this.colonyInfo.energyManagement;
    }

    public run(): void {
        const mainRoom = this.getMainRoom();
        if (!mainRoom) {
            Logger.warning(`No vision of colony room ${this.colonyInfo.id}, removing from memory...`);
            delete Memory.colonies[this.colonyInfo.id];
            return;
        }

        // Migration: rooms from array to object
        if (Array.isArray(this.colonyInfo.rooms)) {
            const roomsArray = this.colonyInfo.rooms as any as any[];
            this.colonyInfo.rooms = {};
            roomsArray.forEach(r => {
                this.colonyInfo.rooms[r.name] = r;
            });
        }

        // Detect potential colony restart:
        // We have setupComplete, but the registered spawn is gone, we have no creeps,
        // AND there is a new spawn in the room.
        if (
            this.colonyInfo.setupComplete &&
            !Game.getObjectById(this.colonyInfo.mainSpawnId) &&
            this.getCreeps().length === 0
        ) {
            const spawns = mainRoom.find(FIND_MY_SPAWNS);
            if (spawns.length > 0) {
                Logger.info(
                    `[Colony] ${this.colonyInfo.id} | Detected restart (new spawn found, no creeps). Resetting setupComplete.`,
                );
                this.colonyInfo.setupComplete = false;
            }
        }

        const systems = this.getSystemsList();
        const spawnManager = new Spawning(this);

        if (!this.colonyInfo.setupComplete) {
            Logger.info(`[Colony] initialSetup`);
            this.colonyInfo.setupComplete = this.initialSetup();
            systems.forEach(x => x.onStart());
        }

        // Keep the stored level current: other colonies read it from Memory to size
        // their remote-room claims, and the intel overlay reads it for the slot cap.
        this.colonyInfo.level = this.getMainRoom().controller?.level || this.colonyInfo.level || 0;

        this.manageEnergyProductionConsumption();

        spawnManager.run();
        systems.forEach(x => x.run());
        this.constructionManager.run();
        this.linkManager.run();
        this.terminalManager.run();
        this.labManager.run();
        this.observerManager.run();

        this.creepManager();
        if (CpuBudget.optionalAllowed()) {
            this.visualizeStats();
        }
    }

    public getSystemsList(): BaseSystem[] {
        const s = this.systems as unknown as { [k: string]: BaseSystem };
        const systems = [];
        for (const key in s) {
            systems.push(s[key]);
        }
        return systems;
    }

    public visualizeStats(): void {
        const room = this.getMainRoom();
        if (!room || !room.visual) {
            return;
        }
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
        const {
            storedEnergy = 0,
            energyReserve = 0,
            energySurplus = 0,
            spendableEnergyRate = 0,
        } = this.systems.energy.systemInfo;
        room.visual.text(
            `Spendable: ${spendableEnergyRate.toFixed(1)}/t    Stored: ${Math.round(storedEnergy)} (reserve ${energyReserve}, surplus ${Math.round(energySurplus)})`,
            3,
            8,
            textStyle,
        );

        const visualizeSystems = this.getEnergyTrackingSystems();
        this.visualizeSystems(visualizeSystems);
        this.visualizeSpawnQueue();
        this.visualizeSystemTasks();
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
        let offset = 9; // Below the colony energy summary lines

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

    private visualizeSystemTasks(): void {
        const room = this.getMainRoom();
        const x = 3;
        let y = 15;

        room.visual.text("System Tasks:", x, y++, { align: "left", color: "#aaaaaa", opacity: 0.8 });

        const systems = this.getSystemsList();
        let anyTask = false;

        for (const system of systems) {
            const status = system.getStatus();
            if (status) {
                room.visual.text(`- ${status}`, x, y++, { align: "left", font: 0.5, color: "#00ff00" });
                anyTask = true;
            }
        }

        if (!anyTask) {
            room.visual.text("- Idle -", x, y++, { align: "left", font: 0.5, color: "#666666" });
        }
    }

    public manageEnergyProductionConsumption(): void {
        const gross = this.systems.energy.getTheoreticalGrossProduction();
        let upkeep = 0;

        this.systems.energy
            .getSpawnerProfilesList()
            .forEach((x: CreepSpawnerProfileInfo) => (upkeep += (x.spawnCostPerTick || 0) * (x.desiredAmount || 0)));

        const productionRate = gross - upkeep;
        this.systems.energy.systemInfo.estimatedEnergyProductionRate = productionRate;
        (this.systems.energy.systemInfo as any).grossProduction = gross;
        (this.systems.energy.systemInfo as any).upkeep = upkeep;

        // Budget from income plus a drawdown of whatever is banked above the RCL reserve, so a
        // full storage is spent on growth instead of sitting idle.
        const storedEnergyPercent = this.getStoredEnergyPercent();
        const storedEnergy = this.getStoredEnergy();
        const rcl = this.getMainRoom()?.controller?.level || 0;
        const reserve = RepairUtils.getStorageTarget(rcl);
        const budget = computeEnergyBudget({
            productionRate,
            storedEnergy,
            storedEnergyPercent,
            reserve,
        });
        const energyInfo = this.systems.energy.systemInfo;
        energyInfo.totalEnergyUsagePercentageAllowed = budget.baseMultiplier;
        energyInfo.storedEnergyPercent = storedEnergyPercent;
        energyInfo.storedEnergy = storedEnergy;
        energyInfo.energyReserve = reserve;
        energyInfo.energySurplus = budget.surplus;
        energyInfo.spendableEnergyRate = budget.spendableRate;

        const systems = this.getSystemsList().filter(s => s !== this.systems.energy);

        // --- Pass 1: Proportional Allocation ---
        this.setEnergyUsageMod();
        systems.forEach(system => this.manageEnergySystem(system));

        // --- Pass 2: Iterative Redistribution of Surplus ---
        let totalSurplus = 0;
        const deficitSystems: { system: BaseSystem; deficit: number; weight: number }[] = [];

        systems.forEach(system => {
            const demand = system.getEnergyDemand();
            const allocation = system.energyUsageTracking.allowedEnergyWorkRate;

            if (allocation > demand) {
                const surplus = allocation - demand;
                system.energyUsageTracking.allowedEnergyWorkRate = demand;
                totalSurplus += surplus;
            } else if (allocation < demand) {
                deficitSystems.push({
                    system,
                    deficit: demand - allocation,
                    weight: system.energyUsageTracking.requestedEnergyUsageWeight,
                });
            }
        });

        if (totalSurplus > 0 && deficitSystems.length > 0) {
            let totalDeficitWeight = 0;
            deficitSystems.forEach(ds => (totalDeficitWeight += ds.weight));

            if (totalDeficitWeight > 0) {
                deficitSystems.forEach(ds => {
                    const extra = (ds.weight / totalDeficitWeight) * totalSurplus;
                    const granted = Math.min(extra, ds.deficit);
                    ds.system.energyUsageTracking.allowedEnergyWorkRate += granted;
                });
            }
        }
    }

    public getStoredEnergyPercent(): number {
        const { energy, capacity } = this.getStoredEnergyState();
        return capacity > 0 ? energy / capacity : 0;
    }

    /** Energy in the primary store (and the room storage, when the primary store is a container). */
    public getStoredEnergy(): number {
        return this.getStoredEnergyState().energy;
    }

    private getStoredEnergyState(): { energy: number; capacity: number } {
        const room = this.getMainRoom();
        if (!room || typeof room.find !== "function") {
            return { energy: 0, capacity: 0 };
        }

        const primaryStorage = this.getPrimaryStorage();
        if (!primaryStorage) {
            return { energy: 0, capacity: 0 };
        }

        let energy = primaryStorage.store[RESOURCE_ENERGY] || 0;
        let capacity = primaryStorage.store.getCapacity(RESOURCE_ENERGY) || 1;

        if (room.storage && primaryStorage.id !== room.storage.id) {
            energy += room.storage.store[RESOURCE_ENERGY] || 0;
            capacity += room.storage.store.getCapacity(RESOURCE_ENERGY) || 0;
        }

        return { energy, capacity };
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

        const energyInfo = this.systems.energy.systemInfo;
        energyTracking.actualEnergyUsagePercentage =
            energyTracking.requestedEnergyUsageWeight * energyInfo.energyUsageModifier;

        // Each system gets its weighted share of the spendable rate. Older memory (and tests)
        // may predate the spendable rate, in which case the income share is all there is.
        const spendable =
            energyInfo.spendableEnergyRate ??
            energyInfo.estimatedEnergyProductionRate * energyInfo.totalEnergyUsagePercentageAllowed;
        energyTracking.allowedEnergyWorkRate =
            (spendable * energyTracking.requestedEnergyUsageWeight) / this.getTotalRequestedEnergyWeight();
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
        const mod =
            this.systems.energy.systemInfo.totalEnergyUsagePercentageAllowed / this.getTotalRequestedEnergyWeight();
        this.systems.energy.systemInfo.energyUsageModifier = mod;
    }

    /** Sum of every system's requested weight; 1 when nothing asks, so shares never divide by zero. */
    private getTotalRequestedEnergyWeight(): number {
        let total = 0;
        this.getEnergyTrackingSystems().forEach(x => {
            total += x.energyTracking.requestedEnergyUsageWeight;
        });
        return total === 0 ? 1 : total;
    }

    public getCreeps(): Creep[] {
        const creeps: Creep[] = [];
        for (const name in this.colonyInfo.creeps) {
            const creep = Game.creeps[name];
            if (creep && creep.memory.colonyId === this.colonyInfo.id) {
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
        const spawnQueue = this.getSpawnQueue();
        for (const name in this.colonyInfo.creeps) {
            const creepData = this.colonyInfo.creeps[name];

            // If it's in Game.creeps, it's alive.
            if (name in Game.creeps) {
                continue;
            }

            // If it has an ID but is not in Game.creeps, it's dead.
            if (creepData.id) {
                delete this.colonyInfo.creeps[name];
                continue;
            }

            // If it's in SPAWN_QUEUE status, check if it's actually in the queue.
            if (creepData.status === CreepStatus.SPAWN_QUEUE) {
                const inQueue = spawnQueue.some(req => req.memory.name === name);
                if (!inQueue) {
                    delete this.colonyInfo.creeps[name];
                }
                continue;
            }

            // If it's not in Game.creeps and not in queue and has no ID, it's a ghost.
            delete this.colonyInfo.creeps[name];
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
        }
        delete this.getColonyCreeps()[name];
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
        Logger.info(`[Colony] Performing initial setup for ${this.colonyInfo.id}`);
        // setup main room
        const room = this.getMainRoom();

        // Clear stale room memory if it exists
        if (Memory.rooms && Memory.rooms[room.name]) {
            Logger.info(`[Colony] Clearing stale room memory for ${room.name}`);
            delete Memory.rooms[room.name];
        }

        this.colonyInfo.rooms = {
            [room.name]: {
                name: room.name,
                isMain: true,
                alertLevel: 0,
            },
        };

        // Reset management objects
        this.colonyInfo.spawnQueue = [];
        this.colonyInfo.creeps = {};

        // Check for existing creeps that belong to this colony (recovery from memory wipe)
        this.scanForCreeps();

        return true;
    }

    private scanForCreeps(): void {
        Logger.info(`Scanning for orphaned creeps in colony ${this.colonyInfo.id}...`);
        const colonyCreeps = this.getColonyCreeps();
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.colonyId === this.colonyInfo.id) {
                if (!colonyCreeps[name]) {
                    Logger.info(`Adopting orphaned creep: ${name}`);
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
        return this.colonyInfo.rooms[name];
    }

    public getMainRoom(): Room {
        return Game.rooms[this.colonyInfo.id];
    }

    public getMainSpawn(): StructureSpawn {
        let spawn = Game.getObjectById(this.colonyInfo.mainSpawnId);
        if (!spawn) {
            Logger.warning(`Colony ${this.colonyInfo.id} does not have a main spawn set, resetting spawn.`);
            const mainRoom = this.getMainRoom();
            if (mainRoom && typeof mainRoom.find === "function") {
                spawn = mainRoom.find(FIND_MY_SPAWNS)[0];
                if (spawn) {
                    this.colonyInfo.mainSpawnId = spawn.id;
                }
            }
        }
        return spawn as StructureSpawn;
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

        // Dynamic discovery: find containers near spawn or sources
        const mainSpawn = this.getMainSpawn();
        const containers = room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER,
        }) as StructureContainer[];

        if (containers.length > 0) {
            // Prefer container closest to spawn
            if (mainSpawn) {
                const closest = mainSpawn.pos.findClosestByRange(containers);
                if (closest) return closest;
            }
            return containers[0];
        }

        return undefined;
    }

    public get builderManagement(): ColonyBuilderManagement | undefined {
        return this.colonyInfo.builderManagement;
    }

    public get creeps(): ColonyCreeps {
        return this.getColonyCreeps();
    }
}

interface EnergyTrackingSystem {
    systemName: string;
    energyTracking: EnergyUsageTracking;
}
