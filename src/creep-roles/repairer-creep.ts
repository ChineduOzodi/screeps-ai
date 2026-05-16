/* eslint-disable max-classes-per-file */
import { CreepRunner } from "prototypes/creep";
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";
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
            if (target && !this.targetNeedsRepair(target)) {
                this.removeTarget();
                return;
            }

            let newTarget = false;

            if (!target) {
                target = this.findTieredRepairTarget();
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
        const room = colony.getMainRoom();
        if (!room) return {};

        const stats = colony.constructionManager.getRepairStats();
        if (stats.totalNeeded === 0) return {};

        // Calculate supported WORK parts based on energy budget
        // unitCost = WORK(100) + CARRY(50) + MOVE(50) = 200
        // consumptionPerTick = WORK * 1 (repair cost) + spawnCost / lifetime
        const unitCost = 200;
        const lifeTime = CREEP_LIFE_TIME || 1500;

        // We want to find 'n' units such that n * 1 + (n * unitCost / lifetime) <= energyBudgetRate
        // n * (1 + unitCost / lifetime) <= energyBudgetRate
        const unitsPerEnergyTick = 1 / (1 + unitCost / lifeTime);
        let supportedUnits = energyBudgetRate * unitsPerEnergyTick;

        // Logging and adjustment based on maintenance needs
        const maintenanceNeed = stats.maintenanceHits; // Energy per tick needed
        if (energyBudgetRate < maintenanceNeed) {
            console.log(
                `[Infrastructure] CRITICAL: Budget insufficient for maintenance in ${room.name}! (Need: ${maintenanceNeed.toFixed(2)}, Budget: ${energyBudgetRate.toFixed(2)})`,
            );
        } else if (stats.fortificationHits > 0 && energyBudgetRate <= maintenanceNeed * 1.1) {
            console.log(
                `[Infrastructure] INFO: Fortification stalled in ${room.name}; budget consumed by maintenance.`,
            );
        }

        // Limit units by energy capacity and reasonable maximums
        const maxUnitsByCapacity = Math.floor(room.energyCapacityAvailable / unitCost);
        supportedUnits = Math.min(supportedUnits, maxUnitsByCapacity, 15); // Max 15 WORK parts

        if (supportedUnits < 1) {
            // If we have needs but budget is too low, try to spawn at least a minimal creep if we have energy
            if (stats.totalNeeded > 0 && room.energyAvailable >= unitCost) {
                supportedUnits = 1;
            } else {
                return {};
            }
        }

        const body = this.createRepairerBody(supportedUnits);
        const consumptionPerTick = EnergyCalculator.calculateWorkerConsumptionPerTick(body, 20, 1);

        const memory: AddCreepToQueueOptions = {
            workAmount: body.filter(p => p === WORK).length,
            averageEnergyConsumptionProductionPerTick: consumptionPerTick,
            workDuration: lifeTime,
            role: CreepRole.REPAIRER,
        };

        const profiles: CreepProfiles = {};
        profiles[CreepRole.REPAIRER] = {
            desiredAmount: 1, // We size the creep to the budget, so 1 is usually enough unless we hit max units
            bodyBlueprint: body,
            memoryBlueprint: memory,
        };

        // If one big creep isn't enough to spend the budget (due to 50 part limit or capacity),
        // we might need more, but for now sizing 1 creep is simpler.
        return profiles;
    }

    private createRepairerBody(units: number): BodyPartConstant[] {
        const body: BodyPartConstant[] = [];
        const roundedUnits = Math.max(1, Math.floor(units));
        for (let i = 0; i < roundedUnits; i++) {
            body.push(WORK);
            body.push(CARRY);
            body.push(MOVE);
        }
        return body;
    }
}
