/* eslint-disable max-classes-per-file */
import { CreepProfiles, CreepRole, CreepRunner } from "prototypes/creep";

import { ColonyManager } from "prototypes/colony";
import { CreepConstants } from "constants/creep-constants";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { Movement } from "infrastructure/movement";

export class MinerCreep extends CreepRunner {
    public constructor(creep: Creep) {
        super(creep);
    }

    public override onRun(): void {
        const { creep, memory } = this;

        if (!memory.workTargetId) {
            throw new Error(`creep does not have sourceId in memory: ${creep.id}`);
        }

        if (!memory.working) {
            memory.working = true;
        }

        const source = Game.getObjectById<Source>(memory.workTargetId);

        if (source) {
            if (this.harvest(source) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(source, memory.workDuration, undefined, ["builder", "upgrader"]);
            }
        } else {
            creep.say(`can't find source in room`);
        }
    }
}

export class MinerCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(energyCap: number, colony: ColonyManager): CreepProfiles {
        const colonySpawns: CreepProfiles = {};
        for (const colonySource of colony.systems.energy.systemInfo.sources) {
            if (!colonySource.accessCount) {
                colonySource.accessCount = 1;
            }
            colonySpawns[`${CreepRole.MINER}-${colonySource.sourceId}`] = this.createProfile(energyCap, colonySource);
        }
        return colonySpawns;
    }

    private createProfile(energyCap: number, colonySource: ColonySource) {
        let workPartCount = Math.floor(energyCap / 100);

        if (workPartCount > 7) {
            workPartCount = 7;
        } else if (workPartCount <= 2) {
            workPartCount = 3;
        }

        const body: BodyPartConstant[] = [];
        for (let i = 0; i < workPartCount - 2; i++) {
            body.push(WORK);
        }
        body.push(MOVE);
        body.push(MOVE);

        const memory: AddCreepToQueueOptions = {
            workTargetId: colonySource.sourceId,
            workAmount: workPartCount,
            averageEnergyConsumptionProductionPerTick: workPartCount * CreepConstants.WORK_PART_ENERGY_HARVEST_PER_TICK,
            workDuration: 100,
            role: CreepRole.MINER,
        };
        const creepSpawnManagement: CreepSpawnerProfileInfo = {
            desiredAmount: 0, // TODO: update desired amount
            bodyBlueprint: body,
            memoryBlueprint: memory,
        };
        return creepSpawnManagement;
    }
}
