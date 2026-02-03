/* eslint-disable max-classes-per-file */
import { CreepProfiles, CreepRole, CreepRunner } from "prototypes/creep";
import { ColonyManager } from "prototypes/colony";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { EnergyCalculator } from "utils/energy-calculator";

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
        let sourcePos = room.storage?.pos;
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

        if (!sourcePos) throw new Error(`No source found for ${controller.id}`); // Should not happen if room works

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
        desiredAmount = Math.min(desiredAmount, 3); // Cap at 3 for now

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
