import { EnergyTrackingImpl } from "infrastructure/energy-tracking";
import { Movement } from "infrastructure/movement";

// Is mirrored to work in screeps.com, so should update the counterpart when updating this
export enum CreepStatus {
    WORKING = "working",
    IDLE = "idle",
    SPAWN_QUEUE = "spawn queue",
    SPAWNING = "spawning",
}

// Is mirrored to work in screeps.com, so should update the counterpart when updating this
export enum CreepWorkPastAction {
    NONE = "none",
    MOVE = "move",

    /** Transfer resource from the creep to another object. */
    TRANSFER = "transfer",
    HARVEST = "harvest",

    /** Withdraw resources from a structure, a tombstone or a ruin. */
    WITHDRAW = "withdraw",

    /** Pick up an item (a dropped piece of energy). */
    PICKUP = "pickup",

    /** Repair a damaged structure using carried energy. */
    REPAIR = "repair",

    /** Build a structure at the target construction site using carried energy. */
    BUILD = "build",
    ATTACK = "attack",
    UPGRADE_CONTROLLER = "upgrade",
}

export enum CreepRole {
    REPAIRER = "repairer",
    BUILDER = "builder",
    HARVESTER = "harvester",
    DEFENDER = "defender",
    UPGRADER = "upgrader",
    MINER = "miner",
}

export interface CreepProfiles {
    [k: string]: CreepSpawnerProfileInfo;
}

export abstract class CreepRunner {
    public creep: Creep;
    protected memory: CreepMemory;

    public constructor(creep: Creep) {
        this.creep = creep;
        this.memory = creep.memory;
    }

    public getColony(): Colony | undefined {
        let colony = Memory.colonies[this.creep.memory.colonyId];
        if (colony) {
            return colony;
        }
        this.creep.memory.colonyId = this.creep.room.name;
        colony = Memory.colonies[this.creep.memory.colonyId];
        if (!colony) {
            console.log(`ERROR: creep (${this.creep.name}) does not have colony at ${this.creep.memory.colonyId}`);
        }
        return colony;
    }

    public run(): void {
        if (this.creep.spawning) {
            return;
        }

        if (this.hasCarryCapacity()) {
            this.trackCreepEnergyFlow();
        }

        this.onRun();
    }

    protected abstract onRun(): void;

    /** Since this function modifies the memory, will only return true once. */
    protected switchFromWorkingToNotWorkingOutOfEnergy(): boolean {
        const { memory } = this.creep;
        if (memory.working && this.creep.store[RESOURCE_ENERGY] === 0) {
            memory.working = false;
            delete this.creep.memory.targetId;
            delete memory.movementSystem?.path;
            return true;
        }
        return false;
    }

    /** Since this function modifies the memory, will only return true once. */
    protected switchFromNotWorkingToWorkingFullEnergy(): boolean {
        const { memory } = this.creep;
        if (!memory.working && this.creep.store[RESOURCE_ENERGY] === this.creep.store.getCapacity()) {
            memory.working = true;
            delete memory.targetId;
            delete memory.movementSystem?.path;
            return true;
        }
        return false;
    }

    private hasCarryCapacity() {
        if (typeof this.creep.memory.hasCarryParts === "undefined") {
            this.creep.memory.hasCarryParts = this.creep.getActiveBodyparts("carry") > 0;
        }
        return this.creep.memory.hasCarryParts;
    }

    private trackCreepEnergyFlow() {
        const { memory } = this.creep;
        if (typeof memory.lastEnergyAmount === "undefined") {
            memory.lastEnergyAmount = 0;
            memory.energyFlow = 0;
            return;
        }

        // Calculate energy difference between last tick and use as energy flow.
        const energy = this.creep.store.getUsedCapacity(RESOURCE_ENERGY);
        memory.energyFlow = energy - memory.lastEnergyAmount;
        memory.lastEnergyAmount = energy;

        // Get last action and use to calculate energy flow for energyTrackingInfo
        if (!memory.lastAction) {
            memory.lastAction = CreepWorkPastAction.NONE;
        }

        if (!memory.energyTrackingInfo) {
            memory.energyTrackingInfo = {};
        }

        const flow = this.getTrackedEnergyFlow(memory.lastAction, memory.energyFlow);
        const energyTracking = new EnergyTrackingImpl(memory.energyTrackingInfo);

        energyTracking.onTickFlow(flow);
    }

    public setAction(action: CreepWorkPastAction) {
        if (this.creep.memory.lastAction !== action) {
            this.creep.say(action);
        }
        this.creep.memory.lastAction = action;
    }

    /** What to count in energyFlow calculations based on the type of creep. */
    public getTrackedEnergyFlow(lastAction: CreepWorkPastAction, energyFlow: number): number {
        switch (lastAction) {
            case CreepWorkPastAction.NONE:
                return 0;
            case CreepWorkPastAction.MOVE:
                return 0;
            case CreepWorkPastAction.TRANSFER:
                return 0;
            case CreepWorkPastAction.WITHDRAW:
                return 0;
            default:
                return energyFlow;
        }
    }

    public getMovementSystem(): CreepMovementSystem {
        if (!this.creep.memory.movementSystem) {
            this.creep.memory.movementSystem = Movement.createMovementSystem(this.creep.pos);
        }
        return this.creep.memory.movementSystem;
    }

    protected moveToWithReservation(
        target: _HasRoomPosition & _HasId,
        workDuration: number,
        range = 1,
        ignoreRoles?: string[],
    ) {
        this.setAction(CreepWorkPastAction.MOVE);
        Movement.moveToWithReservation(this.creep, target, workDuration, range, ignoreRoles);
    }

    protected getTarget(): TargetType {
        if (!this.creep.memory.targetId) {
            return null;
        }

        const target = Game.getObjectById(this.creep.memory.targetId);
        if (!target) {
            this.removeTarget();
        }
        return target as any as TargetType;
    }

    protected removeTarget() {
        delete this.creep.memory.targetId;
        delete this.creep.memory.movementSystem?.path;
    }

    protected targetNeedsRepair(target: TargetType | null): boolean {
        if (!target) {
            return false;
        }
        const t: AnyStructure = target as any;
        return typeof t.hits !== "undefined" && typeof t.hitsMax !== "undefined" && t.hits !== t.hitsMax;
    }

    protected targetIsStructureExtensionFullEnergy(target: TargetType | null): boolean {
        if (!target) {
            return false;
        }

        const t: AnyStructure = target as any;
        if (typeof t.structureType === "undefined" || t.structureType !== STRUCTURE_EXTENSION) {
            return false;
        }
        // Structure can be an extension but will have undefined store if it is not constructed yet.
        return t.store?.getFreeCapacity(RESOURCE_ENERGY) === 0;
    }

    protected findClosestTombstone(minEnergy: number) {
        return this.creep.pos.findClosestByPath(FIND_TOMBSTONES, {
            filter: stone => {
                return stone.store[RESOURCE_ENERGY] >= minEnergy;
            },
        });
    }

    protected findClosestDroppedEnergy(minEnergy: number) {
        return this.creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: resource => {
                return resource.amount >= minEnergy && resource.resourceType === RESOURCE_ENERGY;
            },
        });
    }

    /** Find closest energy stored in container or storage. This includes if you are using containers with a miner creep. */
    protected findClosestStoredEnergy(minEnergy: number) {
        return this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: structure => {
                return (
                    (structure.structureType === STRUCTURE_CONTAINER ||
                        structure.structureType === STRUCTURE_STORAGE) &&
                    structure.store[RESOURCE_ENERGY] >= minEnergy
                );
            },
        });
    }

    /** Finds closest spawn that has full energy. This can be used in an emergency for energy draw. */
    protected findClosestFullSpawn() {
        return this.creep.pos.findClosestByPath<StructureSpawn>(FIND_STRUCTURES, {
            filter: structure => {
                return (
                    structure.structureType === STRUCTURE_SPAWN &&
                    structure.store.energy === structure.store.getCapacity(RESOURCE_ENERGY)
                );
            },
        });
    }

    protected findClosestSource(minEnergy: number) {
        return this.creep.pos.findClosestByPath(FIND_SOURCES, {
            filter: s => {
                return s.energy >= minEnergy;
            },
        });
    }

    protected findClosestStructureExtension(minFreeSpace: number) {
        return this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: structure => {
                return (
                    structure.structureType === STRUCTURE_EXTENSION &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) >= minFreeSpace
                );
            },
        });
    }

    /**
     * Find Most damaged structure in the room.
     * @param maxHitPointPercent percent should be a decimal.
     * @returns Target or null.
     */
    protected findMostDamagedStructure(maxHitPointPercent: number) {
        const targets = this.creep.room.find(FIND_STRUCTURES, {
            filter: object => object.hits < object.hitsMax * maxHitPointPercent,
        });

        targets.sort((a, b) => a.hits - b.hits);

        if (targets.length > 0) {
            return targets[0];
        }
        return null;
    }

    protected findNextTargetInBuildQueue() {
        const colony = this.getColony();
        if (!colony) {
            console.log(`${this.creep.name}: missing colony`);
            return null;
        }

        const buildQueue = colony.builderManagement?.buildQueue;
        if (!buildQueue || buildQueue.length === 0) {
            return null;
        }

        const nonRoadConstructionSites = buildQueue.filter(siteId => {
            const site = Game.getObjectById(siteId);
            return site && site.structureType !== STRUCTURE_ROAD;
        });

        if (nonRoadConstructionSites.length > 0) {
            return Game.getObjectById(nonRoadConstructionSites[0]);
        }
        // If all sites are roads, return the first one.
        return Game.getObjectById(buildQueue[0]);
    }

    protected findClosestHostile() {
        return this.creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS);
    }

    public getEnergy(): void {
        const creep = this.creep;

        let target = this.getTarget();
        let newTarget = false;

        if (!target) {
            target = this.findClosestTombstone(25);
            newTarget = true;
        }
        if (!target) {
            target = this.findClosestDroppedEnergy(40);
            newTarget = true;
        }
        if (!target) {
            target = this.findClosestStoredEnergy(25);
            newTarget = true;
        }
        if (!target) {
            target = this.findClosestSource(0);
            newTarget = true;
        }
        if (!target) {
            target = this.findClosestFullSpawn();
            newTarget = true;
        }

        if (newTarget) {
            delete creep.memory.movementSystem?.path;
            creep.memory.targetId = target?.id;
        }

        if (target) {
            const targetAction = target as any;

            if (
                this.withdraw(targetAction, RESOURCE_ENERGY) !== OK &&
                this.transfer(targetAction, RESOURCE_ENERGY) !== OK &&
                this.pickup(targetAction) !== OK &&
                this.harvest(targetAction) !== OK
            ) {
                this.moveToWithReservation(target, creep.memory.workDuration * 0.5);
            }
        } else {
            creep.say("Can't find energy");
        }
    }

    protected withdraw(target: TargetType, resourceType: ResourceConstant, amount?: number): ScreepsReturnCode {
        const actionStatus = this.creep.withdraw(target as any, resourceType, amount);
        if (actionStatus === OK) {
            this.setAction(CreepWorkPastAction.WITHDRAW);
        }
        return actionStatus;
    }

    protected transfer(target: TargetType, resourceType: ResourceConstant, amount?: number): ScreepsReturnCode {
        const actionStatus = this.creep.transfer(target as any, resourceType, amount);
        if (actionStatus === OK) {
            this.setAction(CreepWorkPastAction.TRANSFER);
        }
        return actionStatus;
    }

    protected pickup(target: TargetType): -8 | CreepActionReturnCode {
        const actionStatus = this.creep.pickup(target as any);
        if (actionStatus === OK) {
            this.setAction(CreepWorkPastAction.PICKUP);
        }
        return actionStatus;
    }

    protected harvest(target: TargetType): -5 | -6 | CreepActionReturnCode {
        const actionStatus = this.creep.harvest(target as any);
        if (actionStatus === OK) {
            this.setAction(CreepWorkPastAction.HARVEST);
        }
        return actionStatus;
    }

    protected repair(target: TargetType): -6 | CreepActionReturnCode {
        const actionStatus = this.creep.repair(target as any);
        if (actionStatus === OK) {
            this.setAction(CreepWorkPastAction.REPAIR);
        }
        return actionStatus;
    }

    protected build(target: TargetType): -6 | -14 | CreepActionReturnCode {
        const actionStatus = this.creep.build(target as any);
        if (actionStatus === OK) {
            this.setAction(CreepWorkPastAction.BUILD);
        }
        return actionStatus;
    }

    protected attack(target: TargetType): CreepActionReturnCode {
        const actionStatus = this.creep.attack(target as any);
        if (actionStatus === OK) {
            this.setAction(CreepWorkPastAction.ATTACK);
        }
        return actionStatus;
    }

    protected upgradeController(target: TargetType): ScreepsReturnCode {
        const actionStatus = this.creep.upgradeController(target as any);
        if (actionStatus === OK) {
            this.setAction(CreepWorkPastAction.UPGRADE_CONTROLLER);
        }
        return actionStatus;
    }
}
