/* eslint-disable max-classes-per-file */
import { CreepProfiles, CreepRole, CreepRunner, CreepSpawner } from "prototypes/creep";

import { BaseSystemImpl } from "systems/base-system";
import { ColonyManager } from "prototypes/colony";
import { CreepConstants } from "constants/creep-constants";
import { MovementSystem } from "systems/movement-system";

export class RepairerCreep extends CreepRunner {
    public constructor(creep: Creep) {
        super(creep);
    }

    public override onRun(): void {
        const { creep, memory } = this;

        if (this.switchFromWorkingToNotWorkingOutOfEnergy()) {
            creep.say("r: refilling");
        }

        if (this.switchFromNotWorkingToWorkingFullEnergy()) {
            creep.say("r: working");
        }

        if (memory.working) {
            let target = this.getTarget();
            if (target && (!this.targetNeedsRepair(target) || this.targetIsStructureExtensionFullEnergy(target))) {
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
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    const t: AnyStructure = target as any;
                    const workDuration = t.structureType === STRUCTURE_EXTENSION ? 2 : memory.workAmount || 10;
                    const range = t.structureType === STRUCTURE_EXTENSION ? 1 : 3;
                    MovementSystem.moveToWithReservation(creep, target, workDuration, range);
                } else {
                    creep.say("acting");
                }
            }
        } else {
            // find energy
            this.getEnergy();
        }
    }
}

export class RepairerCreepSpawner implements CreepSpawner {
    public createProfiles(energyCap: number, _colony: ColonyManager): CreepProfiles {
        const maxCreepCount = 1;

        const creepBodyScale = Math.floor(
            energyCap /
                (CreepConstants.WORK_PART_COST + CreepConstants.CARRY_PART_COST + CreepConstants.MOVE_PART_COST),
        );
        const body = BaseSystemImpl.scaleCreepBody([WORK, CARRY, MOVE], creepBodyScale);

        const memory: AddCreepToQueueOptions = {
            workAmount: creepBodyScale,
            averageEnergyConsumptionProductionPerTick: creepBodyScale,
            workDuration: 2,
            role: CreepRole.REPAIRER,
        };
        const creepSpawnManagement: ColonyCreepSpawnManagement = {
            creepNames: [],
            desiredAmount: maxCreepCount,
            bodyBlueprint: body,
            memoryBlueprint: memory,
        };

        const profiles: CreepProfiles = {};
        profiles[CreepRole.REPAIRER] = creepSpawnManagement;
        return profiles;
    }
}
