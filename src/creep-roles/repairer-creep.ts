/* eslint-disable max-classes-per-file */
import { CreepProfiles, CreepRole, CreepRunner } from "prototypes/creep";

import { BaseSystemImpl } from "systems/base-system";
import { ColonyManager } from "prototypes/colony";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { EnergyCalculator } from "utils/energy-calculator";

export class RepairerCreep extends CreepRunner {
    public constructor(creep: Creep) {
        super(creep);
    }

    public override onRun(): void {
        const { creep, memory } = this;
        this.switchFromWorkingToNotWorkingOutOfEnergy();
        this.switchFromNotWorkingToWorkingFullEnergy();

        if (memory.working) {
            let target = this.getTarget();
            if (target && !this.targetIsValidHealerAlternative(target) && !this.targetNeedsRepair(target)) {
                this.removeTarget();
                return;
            }

            if (this.targetIsStructureExtensionFullEnergy(target)) {
                this.removeTarget();
                return;
            }

            let newTarget = false;

            if (!target) {
                target = this.findMostDamagedStructure(0.5);
                newTarget = true;
            }

            if (!target) {
                target = this.findClosestStructureExtension(1);
                newTarget = true;
            }

            if (!target) {
                target = this.findNextTargetInBuildQueue();
                newTarget = true;
            }

            if (newTarget) {
                delete creep.memory.movementSystem?.path;
                creep.memory.targetId = target?.id;
            }

            if (target) {
                if (
                    this.repair(target) !== OK &&
                    this.transfer(target, RESOURCE_ENERGY) !== OK &&
                    this.build(target as any as ConstructionSite) !== OK
                ) {
                    const t: AnyStructure = target as any;
                    const workDuration = t.structureType === STRUCTURE_EXTENSION ? 2 : memory.workAmount || 10;
                    const range = t.structureType === STRUCTURE_EXTENSION ? 1 : 3;
                    this.moveToWithReservation(target, workDuration, range);
                }
            }
        } else {
            // find energy
            this.getEnergy();
        }
    }

    public targetIsValidHealerAlternative(target: _HasId & _HasRoomPosition): boolean {
        return (
            target instanceof ConstructionSite ||
            target instanceof StructureSpawn ||
            target instanceof StructureExtension
        );
    }
}

export class RepairerCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(energyBudgetRate: number, colony: ColonyManager): CreepProfiles {
        // Find most damaged structure, or assume average
        const room = colony.getMainRoom();

        let targetPos = room.storage?.pos;
        if (!targetPos) {
             const sources = colony.systems.energy.systemInfo.sources;
             if (sources && sources.length > 0) {
                 const p = sources[0].position;
                 targetPos = new RoomPosition(p.x, p.y, p.roomName);
             }
        }
        if (!targetPos) return {};

        // Find dist from spawn/storage
        let sourcePos = room.storage?.pos || room.find(FIND_SOURCES)[0]?.pos;
        let dist = 20; // fallback
        if (targetPos && sourcePos) {
            dist = EnergyCalculator.calculateTravelTime(sourcePos, targetPos);
        }

        const energyCap = room.energyCapacityAvailable;
        const body = this.createRepairerBody(energyCap);

        const consumptionPerTick = EnergyCalculator.calculateWorkerConsumptionPerTick(body, dist, 1);

        let desiredAmount = 0;
        if (consumptionPerTick > 0 && energyBudgetRate > 0) {
             desiredAmount = Math.floor(energyBudgetRate / consumptionPerTick);
        }

        // Cap repairers to avoid spam since they are highly efficient
        desiredAmount = Math.min(desiredAmount, 2);

        const memory: AddCreepToQueueOptions = {
            workAmount: body.filter(p => p === WORK).length,
            averageEnergyConsumptionProductionPerTick: consumptionPerTick,
            workDuration: 1500,
            role: CreepRole.REPAIRER,
        };
        const creepSpawnManagement: CreepSpawnerProfileInfo = {
            desiredAmount: desiredAmount,
            bodyBlueprint: body,
            memoryBlueprint: memory,
        };

        const profiles: CreepProfiles = {};
        profiles[CreepRole.REPAIRER] = creepSpawnManagement;
        return profiles;
    }

    private createRepairerBody(energyCap: number): BodyPartConstant[] {
        // [WORK, CARRY, MOVE]
        const unitCost = 200;
        const maxUnits = Math.floor(energyCap / unitCost);
        const units = Math.min(maxUnits, 8); // Repairers don't need to be huge

        const body: BodyPartConstant[] = [];
        for(let i=0; i<units; i++) {
            body.push(WORK);
            body.push(CARRY);
            body.push(MOVE);
        }
        return body;
    }
}
