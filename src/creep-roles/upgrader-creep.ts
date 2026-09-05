/* eslint-disable max-classes-per-file */
import { CreepRunner } from "prototypes/creep";
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { EnergyCalculator } from "utils/energy-calculator";
import { Logger } from "utils/logger";

/** Upgraders a colony runs while it is still building its reserve. */
export const MAX_UPGRADERS = 3;
/** Upgraders a colony may run while it has energy banked above the reserve. */
export const MAX_UPGRADERS_WITH_SURPLUS = 8;

export class UpgraderCreep extends CreepRunner {
    public override onRun(): void {
        this.runUpgraderCreep();
    }

    private runUpgraderCreep(): void {
        const creep = this.creep;
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
            delete creep.memory.targetId;
            delete creep.memory.movementSystem?.path;
            creep.say("u: harvesting");
        }
        if (!creep.memory.working && creep.store[RESOURCE_ENERGY] === creep.store.getCapacity()) {
            creep.memory.working = true;
            delete creep.memory.targetId;
            delete creep.memory.movementSystem?.path;
            creep.say("upgrading");
        }
        if (creep.memory.working) {
            if (!creep.room.controller) {
                throw new Error(`${creep.id} - No room controller to upgrade: ${creep.room.name}`);
            }

            if (this.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(creep.room.controller, creep.memory.workDuration, 3);
            }
        } else {
            // Find energy
            this.getEnergy();
        }
    }
}

export class UpgraderCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(energyBudgetRate: number, colony: ColonyManager): CreepProfiles {
        // Find path metrics
        const room = colony.getMainRoom();
        const controller = room.controller;
        if (!controller) return {};

        // Find dropoff/pickup
        // If storage exists, use that. Else find closest source.
        let sourcePos = colony.getPrimaryStorage()?.pos;
        if (!sourcePos) {
            const sources = colony.systems.energy.systemInfo.sources;
            if (sources && sources.length > 0) {
                // Simple closest source logic
                let bestSource = sources[0];
                let bestDist = Infinity;
                for (const s of sources) {
                    const sPos = new RoomPosition(s.position.x, s.position.y, s.position.roomName);
                    const dist = EnergyCalculator.calculateTravelTime(controller.pos, sPos);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestSource = s;
                    }
                }
                const p = bestSource.position;
                sourcePos = new RoomPosition(p.x, p.y, p.roomName);
            }
        }

        if (!sourcePos) {
            // Fall back to sources we can currently see: the energy system's source list can be
            // empty right after an attack or while the room is being re-surveyed.
            const visibleSource = controller.pos.findClosestByRange(FIND_SOURCES);
            sourcePos = visibleSource?.pos;
        }

        if (!sourcePos) {
            // No known energy source for this colony yet. Skip upgraders this pass rather than
            // throwing, which would abort the whole colony run.
            Logger.warning(`[Upgrader] no known energy source for ${room.name}, skipping upgrader profiles`);
            return {};
        }

        const distToSource = EnergyCalculator.calculateTravelTime(controller.pos, sourcePos);

        // Define Body
        // Simple scaling body for now: [WORK, CARRY, MOVE] ratio
        // Upgrader: Needs consistent efficient transfer.
        // Pre-Link: Travel. WORK parts should drain CARRY roughly when needed?
        // Actually, just maximize WORK per tick given the budget.

        // Let's create a dynamic body based on room capacity (max size creep) AND budget rate
        const roomCapacity = room.energyCapacityAvailable;
        const body = this.createUpgraderBody(roomCapacity, distToSource);

        const consumptionPerTick = EnergyCalculator.calculateWorkerConsumptionPerTick(body, distToSource, 1); // 1 energy per tick per work (upgrade)

        let desiredAmount = 0;
        if (consumptionPerTick > 0 && energyBudgetRate > 0) {
            desiredAmount = Math.floor(energyBudgetRate / consumptionPerTick);
        }

        // Hard cap for controller slots? Usually 1-2 heavy upgraders is enough, or swarm for early RCL.
        // Limit to reasonable number to avoid CPU spam
        if (colony.getPrimaryStorage()) {
            // Min 1, Max energy budget
            desiredAmount = Math.max(1, desiredAmount);
        } else {
            // Exactly 1 if no storage
            desiredAmount = 1;
        }

        // Cap the count to keep CPU sane. The cap lifts while there is energy banked above the
        // reserve, since that surplus is only ever spent through upgraders.
        const surplus = colony.colonyInfo.energyManagement?.energySurplus || 0;
        desiredAmount = Math.min(desiredAmount, UpgraderCreepSpawner.maxUpgraders(surplus));

        const memory: AddCreepToQueueOptions = {
            workTargetId: controller.id,
            // Estimated time per cycle
            // workDuration is used for internal reservation or timeouts, maybe just lifetime?
            workDuration: 1500,
            averageEnergyConsumptionProductionPerTick: consumptionPerTick,
            role: CreepRole.UPGRADER,
        };

        const creepSpawnManagement: CreepSpawnerProfileInfo = {
            desiredAmount,
            bodyBlueprint: body,
            memoryBlueprint: memory,
            priority: 5, // Lower than harvester
        };

        const profiles: CreepProfiles = {};
        profiles[CreepRole.UPGRADER] = creepSpawnManagement;
        return profiles;
    }

    /** How many upgraders a colony may run: the base cap, or the surplus cap while energy is banked. */
    public static maxUpgraders(energySurplus: number): number {
        return energySurplus > 0 ? MAX_UPGRADERS_WITH_SURPLUS : MAX_UPGRADERS;
    }

    private createUpgraderBody(energyCap: number, distance: number): BodyPartConstant[] {
        // Simple builder: 1 WORK, 1 CARRY, 1 MOVE = 200
        // Optimization: If close, more WORK. If far, more CARRY?
        // For now, linear scaling [WORK, CARRY, MOVE]

        const unitCost = 200;
        const maxUnits = Math.floor(energyCap / unitCost);
        const units = Math.min(maxUnits, 16); // Cap size at something reasonable (16*3 = 48 parts)

        const body: BodyPartConstant[] = [];
        for (let i = 0; i < units; i++) {
            body.push(WORK);
            body.push(CARRY);
            body.push(MOVE);
        }
        return body;
    }
}
