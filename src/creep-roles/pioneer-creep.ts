/* eslint-disable max-classes-per-file */
import { CreepRunner } from "prototypes/creep";
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";

/**
 * Bootstraps a freshly claimed room: harvests local energy, builds the first
 * spawn, and keeps the controller from downgrading. Once the new spawn exists,
 * the room becomes a self-sufficient colony and pioneers phase out.
 */
export class PioneerCreep extends CreepRunner {
    public constructor(creep: Creep) {
        super(creep);
    }

    public override onRun(): void {
        const { creep, memory } = this;
        const targetRoomName = memory.workTargetId;

        if (!targetRoomName) {
            creep.say("No target");
            return;
        }

        if (creep.room.name !== targetRoomName) {
            this.moveToWithReservation({ pos: new RoomPosition(25, 25, targetRoomName) }, 0, 20);
            return;
        }

        // Cycle state
        if (memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            memory.working = false;
            this.removeTarget();
        }
        if (!memory.working && creep.store.getFreeCapacity() === 0) {
            memory.working = true;
            this.removeTarget();
        }

        if (memory.working) {
            this.doWork();
        } else {
            this.gatherLocalEnergy();
        }
    }

    private doWork(): void {
        const { creep } = this;
        const room = creep.room;

        // Priority 1: Build the spawn (or any other site while we're at it)
        const spawnSite = room.find(FIND_MY_CONSTRUCTION_SITES, {
            filter: s => s.structureType === STRUCTURE_SPAWN,
        })[0];
        const site = spawnSite || room.find(FIND_MY_CONSTRUCTION_SITES)[0];

        if (site) {
            if (this.build(site) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(site, creep.memory.workDuration, 3);
            }
            return;
        }

        // Priority 2: Upgrade the controller so RCL1 doesn't stall/downgrade
        if (room.controller && room.controller.my) {
            if (this.upgradeController(room.controller) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(room.controller, creep.memory.workDuration, 3);
            }
        }
    }

    private gatherLocalEnergy(): void {
        const { creep } = this;

        // Prefer scavenging, then harvest a source in the new room.
        const dropped = this.findClosestDroppedEnergy(40);
        if (dropped) {
            if (this.pickup(dropped) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(dropped, creep.memory.workDuration);
            }
            return;
        }

        const source = this.findClosestSource(0);
        if (source) {
            if (this.harvest(source) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(source, creep.memory.workDuration);
            }
        } else {
            creep.say("no energy");
        }
    }
}

export class PioneerCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(_energyBudgetRate: number, colony: ColonyManager): CreepProfiles {
        const expansion = colony.colonyInfo.expansionManagement;
        const target = expansion?.expansionTarget;
        if (!target) return {};

        // Pioneers are only useful once the room is claimed and until its first spawn is running.
        const targetRoom = Game.rooms[target];
        if (!targetRoom || !targetRoom.controller || !targetRoom.controller.my) return {};
        if (targetRoom.find(FIND_MY_SPAWNS).length > 0) return {};

        const body = this.createPioneerBody(colony.getMainRoom().energyCapacityAvailable);

        return {
            [`${CreepRole.PIONEER}-${target}`]: {
                desiredAmount: 3,
                bodyBlueprint: body,
                memoryBlueprint: {
                    role: CreepRole.PIONEER,
                    workTargetId: target,
                    workDuration: 20,
                    averageEnergyConsumptionProductionPerTick: 0,
                },
                priority: 3,
            },
        };
    }

    private createPioneerBody(energyCap: number): BodyPartConstant[] {
        // [WORK, CARRY, MOVE, MOVE] = 250: full-speed travel on plains even when loaded.
        const unitCost = 250;
        let units = Math.floor(energyCap / unitCost);
        units = Math.min(units, 6);
        if (units < 1) units = 1;

        const body: BodyPartConstant[] = [];
        for (let i = 0; i < units; i++) {
            body.push(WORK, CARRY, MOVE, MOVE);
        }
        return body;
    }
}
