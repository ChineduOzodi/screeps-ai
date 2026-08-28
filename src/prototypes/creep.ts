import { Movement } from "infrastructure/movement";
import { ColonyManager, CreepProfiles, CreepRole, CreepStatus } from "./types";
import { LabManager } from "managers/lab-manager";
import { RepairUtils } from "utils/repair-utils";
import { REPAIR_THRESHOLD_DECAY_PREVENTION, REPAIR_THRESHOLD_EMERGENCY } from "constants/repair-constants";
import { RoomUtils } from "utils/room-utils";
import { Logger } from "utils/logger";

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
        if (memory.working) {
            return false;
        }

        const isFull = this.creep.store[RESOURCE_ENERGY] === this.creep.store.getCapacity();
        const hasSomeEnergy = this.creep.store[RESOURCE_ENERGY] > 0;

        let shouldWork = isFull;

        if (!shouldWork && hasSomeEnergy) {
            // Check for emergency if we have some energy but are not full
            const colony = this.getColony();
            if (colony) {
                const stats = colony.constructionManager.getRepairStats();
                if (stats.emergencyHits > 0) {
                    shouldWork = true;
                }
            }
        }

        if (shouldWork) {
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

    protected findTieredRepairTarget(targetRoom?: Room): AnyStructure | null {
        const room = targetRoom || this.creep.room;
        const rcl = room.controller?.level || 0;

        // Tier 1: Emergency (Non-wall/rampart < 20% or roads/containers < 1000)
        const emergency = room.find(FIND_STRUCTURES, {
            filter: s => {
                if (
                    s.structureType === STRUCTURE_WALL ||
                    s.structureType === STRUCTURE_RAMPART ||
                    s.structureType === STRUCTURE_CONTROLLER
                )
                    return false;
                return s.hits < s.hitsMax * REPAIR_THRESHOLD_EMERGENCY || s.hits < REPAIR_THRESHOLD_DECAY_PREVENTION;
            },
        });
        if (emergency.length > 0) {
            const target = this.creep.pos.findClosestByRange(emergency);
            if (target) {
                Logger.debug(`[Creep] ${this.creep.name} found Tier 1 emergency target: ${target.id}`);
                return target;
            }
            Logger.debug(
                `[Creep] ${this.creep.name} found ${emergency.length} Tier 1 emergency structures, but none are reachable.`,
            );
        }

        // Tier 2: Decay Prevention (Walls/Ramparts < 1000)
        const decayPrevention = room.find(FIND_STRUCTURES, {
            filter: s => {
                const isWallRampart = s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART;
                const needsDecayPrevention = s.hits < REPAIR_THRESHOLD_DECAY_PREVENTION;
                return isWallRampart && needsDecayPrevention;
            },
        });
        if (decayPrevention.length > 0) {
            Logger.debug(`[Creep] ${this.creep.name} found ${decayPrevention.length} structures for decay prevention`);
            const target = this.creep.pos.findClosestByRange(decayPrevention);
            if (target) {
                Logger.debug(`[Creep] ${this.creep.name} found Tier 2 decay prevention target: ${target.id}`);
                return target as AnyStructure;
            }
            Logger.debug(
                `[Creep] ${this.creep.name} found ${decayPrevention.length} Tier 2 decay structures, but none are reachable.`,
            );
        }

        // Tier 3: Maintenance (General Infrastructure < 100%)
        const maintenance = room.find(FIND_STRUCTURES, {
            filter: s => {
                if (
                    s.structureType === STRUCTURE_WALL ||
                    s.structureType === STRUCTURE_RAMPART ||
                    s.structureType === STRUCTURE_CONTROLLER
                )
                    return false;
                return s.hits < s.hitsMax;
            },
        });
        if (maintenance.length > 0) {
            const target = this.creep.pos.findClosestByRange(maintenance);
            if (target) {
                Logger.debug(`[Creep] ${this.creep.name} found Tier 3 maintenance target: ${target.id}`);
                return target;
            }
            Logger.debug(
                `[Creep] ${this.creep.name} found ${maintenance.length} Tier 3 maintenance structures, but none are reachable.`,
            );
        }

        // Tier 4: Fortification (Walls/Ramparts < Target HP)
        const fortification = room.find(FIND_STRUCTURES, {
            filter: s => {
                const targetHits = RepairUtils.getStructureTargetHits(s, rcl);
                return (
                    (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) && s.hits < targetHits
                );
            },
        });
        if (fortification.length > 0) {
            const target = this.creep.pos.findClosestByRange(fortification);
            if (target) {
                Logger.debug(`[Creep] ${this.creep.name} found Tier 4 fortification target: ${target.id}`);
                return target;
            }
            Logger.debug(
                `[Creep] ${this.creep.name} found ${fortification.length} Tier 4 fortification structures, but none are reachable.`,
            );
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
        return this.creep.pos.findClosestByRange(FIND_TOMBSTONES, {
            filter: stone => {
                return stone.store[RESOURCE_ENERGY] >= minEnergy;
            },
        });
    }

    protected findClosestDroppedEnergy(minEnergy: number) {
        return this.creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
            filter: resource => {
                return resource.amount >= minEnergy && resource.resourceType === RESOURCE_ENERGY;
            },
        });
    }

    /** Find closest energy stored in container, storage, or a receiving link (links near sources are excluded — they feed the network). */
    protected findClosestStoredEnergy(minEnergy: number) {
        return this.creep.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: structure => {
                if (structure.structureType === STRUCTURE_CONTAINER || structure.structureType === STRUCTURE_STORAGE) {
                    return structure.store[RESOURCE_ENERGY] >= minEnergy;
                }
                if (structure.structureType === STRUCTURE_LINK && (structure as StructureLink).my) {
                    return (
                        structure.store[RESOURCE_ENERGY] >= minEnergy &&
                        structure.pos.findInRange(FIND_SOURCES, 2).length === 0
                    );
                }
                return false;
            },
        });
    }

    /** Finds closest spawn that has full energy. This can be used in an emergency for energy draw. */
    protected findClosestFullSpawn() {
        return this.creep.pos.findClosestByRange<StructureSpawn>(FIND_STRUCTURES, {
            filter: structure => {
                return (
                    structure.structureType === STRUCTURE_SPAWN &&
                    structure.store.energy === structure.store.getCapacity(RESOURCE_ENERGY)
                );
            },
        });
    }

    protected findClosestSource(minEnergy: number) {
        const sources = this.creep.room.find(FIND_SOURCES, {
            filter: s => {
                return s.energy >= minEnergy;
            },
        });
        if (sources.length === 0) {
            return null;
        }

        // Prefer sources with an open harvesting seat; a source whose walkable
        // tiles are all occupied (e.g. a single-seat source held by a harvester
        // or miner) stays a fallback only, so workers don't commit to a far
        // occupied source when another has room.
        const openSources = sources.filter(s => this.sourceHasFreeSeat(s));
        return this.creep.pos.findClosestByRange(openSources.length > 0 ? openSources : sources);
    }

    /** True if at least one walkable tile adjacent to the source is not occupied by another creep. */
    private sourceHasFreeSeat(source: Source): boolean {
        const terrain = source.room.getTerrain();
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const x = source.pos.x + dx;
                const y = source.pos.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                const occupied = source.room.lookForAt(LOOK_CREEPS, x, y).some(c => c.id !== this.creep.id);
                if (!occupied) {
                    return true;
                }
            }
        }
        return false;
    }

    protected findClosestStructureExtension(minFreeSpace: number) {
        return this.creep.pos.findClosestByRange(FIND_STRUCTURES, {
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
            Logger.warning(`${this.creep.name}: missing colony`);
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
        return this.creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    }

    /**
     * Finds an own rampart the creep can stand on to fight the target from safety:
     * walkable (no blocking structure), unoccupied (or occupied by this creep), and
     * within `range` of the target. Melee wants range 1, ranged wants range 3.
     */
    protected findCombatRampart(target: _HasRoomPosition, range: number): StructureRampart | null {
        const { creep } = this;
        if (typeof creep.room.find !== "function") return null;

        const ramparts = creep.room.find<StructureRampart>(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_RAMPART && s.pos.inRangeTo(target.pos, range),
        });

        const usable = ramparts.filter(rampart => {
            const blocked = rampart.pos
                .lookFor(LOOK_STRUCTURES)
                .some(
                    s =>
                        s.structureType !== STRUCTURE_RAMPART &&
                        s.structureType !== STRUCTURE_ROAD &&
                        s.structureType !== STRUCTURE_CONTAINER,
                );
            if (blocked) return false;

            const occupants = rampart.pos.lookFor(LOOK_CREEPS);
            return occupants.length === 0 || occupants[0].id === creep.id;
        });

        if (usable.length === 0) return null;
        return creep.pos.findClosestByRange(usable);
    }

    /** Whether the creep is currently standing on one of our ramparts. */
    protected isOnOwnRampart(): boolean {
        return this.creep.pos
            .lookFor(LOOK_STRUCTURES)
            .some(s => s.structureType === STRUCTURE_RAMPART && (s as StructureRampart).my);
    }

    /**
     * One-shot boost attempt for combat creeps: if a lab holds a suitable compound,
     * walk there and boost. Returns true while the creep is busy boosting (the
     * caller should skip its normal behavior for the tick).
     */
    protected tryBoost(part: BodyPartConstant): boolean {
        const { creep, memory } = this;
        if (memory.boostAttempted) return false;

        const unboostedParts = creep.body.filter(p => p.type === part && !p.boost).length;
        if (unboostedParts === 0) {
            memory.boostAttempted = true;
            return false;
        }

        const lab = LabManager.findBoostLab(creep.room, part, unboostedParts);
        if (!lab) {
            memory.boostAttempted = true;
            return false;
        }

        const result = lab.boostCreep(creep);
        if (result === ERR_NOT_IN_RANGE) {
            this.moveToWithReservation(lab, 5, 1);
            return true;
        }

        memory.boostAttempted = true;
        return false;
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
            Logger.debug(`[Creep] ${this.creep.name} (${this.memory.role}) repairing ${target?.id}`);
            // this.setAction(CreepWorkPastAction.REPAIR);
        }
        return actionStatus;
    }

    protected build(target: TargetType): -6 | -14 | CreepActionReturnCode {
        const actionStatus = this.creep.build(target as any);
        if (actionStatus === OK) {
            Logger.debug(`[Creep] ${this.creep.name} (${this.memory.role}) building ${target?.id}`);
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

    protected upgradeController(target: TargetType): ScreepsReturnCode | -16 {
        const actionStatus = this.creep.upgradeController(target as any);
        if (actionStatus === OK) {
            Logger.debug(`[Creep] ${this.creep.name} (${this.memory.role}) upgrading controller`);
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
