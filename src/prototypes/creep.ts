import { Movement } from "infrastructure/movement";
import { ColonyManager, CreepProfiles, CreepRole, CreepStatus } from "./types";
import { RepairUtils } from "utils/repair-utils";
import { REPAIR_THRESHOLD_DECAY_PREVENTION, REPAIR_THRESHOLD_EMERGENCY } from "constants/repair-constants";
import { RoomUtils } from "utils/room-utils";

export abstract class CreepRunner {
    public creep: Creep;
    protected memory: CreepMemory;
    protected colony: ColonyManager | undefined;

    public constructor(creep: Creep) {
        this.creep = creep;
        this.memory = creep.memory;
    }

    public setColony(colony: ColonyManager): void {
        this.colony = colony;
    }

    public getColony(): ColonyManager | undefined {
        return this.colony;
    }

    public run(): void {
        if (this.creep.spawning) {
            return;
        }

        this.updateRoomVisibility();
        this.onRun();
    }

    private updateRoomVisibility(): void {
        if (Game.time % 50 !== 0) return;
        const colony = this.getColony();
        if (!colony) return;

        // Update room data if we have vision of a room that is not the main colony room
        // or if it's the main room and we haven't updated in a while.
        RoomUtils.updateRoomData(colony, this.creep.room);
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

    public getMovementSystem(): CreepMovementSystem {
        if (!this.creep.memory.movementSystem) {
            this.creep.memory.movementSystem = Movement.createMovementSystem(this.creep.pos);
        }
        return this.creep.memory.movementSystem;
    }

    protected moveToWithReservation(
        target: _HasRoomPosition & Partial<_HasId>,
        workDuration: number,
        range = 1,
        ignoreRoles?: string[],
    ) {
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
        if (typeof t.hits === "undefined") return false;

        const rcl = t.room?.controller?.level || 0;
        const targetHits = RepairUtils.getStructureTargetHits(t, rcl);

        return t.hits < targetHits;
    }

    protected findTieredRepairTarget(): AnyStructure | null {
        const room = this.creep.room;
        const rcl = room.controller?.level || 0;

        // Tier 1: Emergency (Non-wall/rampart < 20% or roads/containers < 1000)
        const emergency = room.find(FIND_STRUCTURES, {
            filter: s => {
                if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) return false;
                return s.hits < s.hitsMax * REPAIR_THRESHOLD_EMERGENCY || s.hits < REPAIR_THRESHOLD_DECAY_PREVENTION;
            },
        });
        if (emergency.length > 0) return emergency.sort((a, b) => a.hits - b.hits)[0];

        // Tier 2: Decay Prevention (Walls/Ramparts < 1000)
        const decayPrevention = room.find(FIND_STRUCTURES, {
            filter: s => {
                return (
                    (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) &&
                    s.hits < REPAIR_THRESHOLD_DECAY_PREVENTION
                );
            },
        });
        if (decayPrevention.length > 0) return decayPrevention.sort((a, b) => a.hits - b.hits)[0];

        // Tier 3: Maintenance (General Infrastructure < 100%)
        const maintenance = room.find(FIND_STRUCTURES, {
            filter: s => {
                if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) return false;
                return s.hits < s.hitsMax;
            },
        });
        if (maintenance.length > 0) return this.creep.pos.findClosestByPath(maintenance);

        // Tier 4: Fortification (Walls/Ramparts < Target HP) - Sorted by Hits for UNIFORMITY
        const fortification = room.find(FIND_STRUCTURES, {
            filter: s => {
                const targetHits = RepairUtils.getStructureTargetHits(s, rcl);
                return (
                    (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) && s.hits < targetHits
                );
            },
        });
        if (fortification.length > 0) {
            // Sort by absolute hits to ensure the weakest parts are reinforced first (uniformity)
            return fortification.sort((a, b) => a.hits - b.hits)[0];
        }

        return null;
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
            // this.setAction(CreepWorkPastAction.WITHDRAW);
        }
        return actionStatus;
    }

    protected transfer(target: TargetType, resourceType: ResourceConstant, amount?: number): ScreepsReturnCode {
        const actionStatus = this.creep.transfer(target as any, resourceType, amount);
        if (actionStatus === OK) {
            // this.setAction(CreepWorkPastAction.TRANSFER);
        }
        return actionStatus;
    }

    protected pickup(target: TargetType): -8 | CreepActionReturnCode {
        const actionStatus = this.creep.pickup(target as any);
        if (actionStatus === OK) {
            // this.setAction(CreepWorkPastAction.PICKUP);
        }
        return actionStatus;
    }

    protected harvest(target: TargetType): -5 | -6 | CreepActionReturnCode {
        const actionStatus = this.creep.harvest(target as any);
        if (actionStatus === OK) {
            // this.setAction(CreepWorkPastAction.HARVEST);
        }
        return actionStatus;
    }

    protected repair(target: TargetType): -6 | CreepActionReturnCode {
        const actionStatus = this.creep.repair(target as any);
        if (actionStatus === OK) {
            // this.setAction(CreepWorkPastAction.REPAIR);
        }
        return actionStatus;
    }

    protected build(target: TargetType): -6 | -14 | CreepActionReturnCode {
        const actionStatus = this.creep.build(target as any);
        if (actionStatus === OK) {
            // this.setAction(CreepWorkPastAction.BUILD);
        }
        return actionStatus;
    }

    protected attack(target: TargetType): CreepActionReturnCode {
        const actionStatus = this.creep.attack(target as any);
        if (actionStatus === OK) {
            // this.setAction(CreepWorkPastAction.ATTACK);
        }
        return actionStatus;
    }

    protected upgradeController(target: TargetType): ScreepsReturnCode {
        const actionStatus = this.creep.upgradeController(target as any);
        if (actionStatus === OK) {
            // this.setAction(CreepWorkPastAction.UPGRADE_CONTROLLER);
        }
        return actionStatus;
    }

    protected heal(target: TargetType): CreepActionReturnCode {
        const actionStatus = this.creep.heal(target as any);
        if (actionStatus === OK) {
            // this.setAction(CreepWorkPastAction.HEAL);
        }
        return actionStatus;
    }
}
