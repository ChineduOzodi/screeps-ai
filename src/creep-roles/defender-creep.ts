/* eslint-disable max-classes-per-file */
import { CreepProfiles, CreepRole, CreepRunner, CreepSpawner } from "prototypes/creep";

import { ColonyManager } from "prototypes/colony";
import { MovementSystem } from "systems/movement-system";

export class DefenderCreep extends CreepRunner {
    public override onRun(): void {
        this.runDefenderCreep();
    }

    public runDefenderCreep(): void {
        const creep = this.creep;

        let target = this.getTarget();
        const newTarget = false;

        if (!target) {
            target = this.findClosestHostile();
        }

        if (newTarget) {
            delete creep.memory.movementSystem?.path;
            creep.memory.targetId = target?.id;
        }

        if (target) {
            if (this.attack(target) === ERR_NOT_IN_RANGE) {
                MovementSystem.moveToWithReservation(creep, target, creep.memory.workDuration);
            }
        }
    }
}

export class DefenderCreepSpawner implements CreepSpawner {
    public createProfiles(energyCap: number, colony: ColonyManager): CreepProfiles {
        const rooms = colony.colonyInfo.rooms;
        const profiles: CreepProfiles = {};
        for (const room of rooms) {
            const profileName = `${CreepRole.DEFENDER}-${room.name}`;
            profiles[profileName] = this.createDefenderProfile(room.name, colony);
            if (room.alertLevel > 0) {
                profiles[profileName].desiredAmount = room.alertLevel + 1;
            }
        }
        return profiles;
    }

    private createDefenderProfile(roomName: string, colony: ColonyManager): ColonyCreepSpawnManagement {
        const body: BodyPartConstant[] = [];

        const room = colony.getMainRoom();
        const energy = room.energyCapacityAvailable;

        const numberOfParts = Math.max(
            1,
            Math.floor(energy / (BODYPART_COST.attack + BODYPART_COST.move + BODYPART_COST.tough)),
        );

        for (let i = 0; i < numberOfParts; i++) {
            body.push(TOUGH);
            body.push(MOVE);
            body.push(ATTACK);
        }

        const energyUsePerTick = 0;

        const memory: AddCreepToQueueOptions = {
            homeRoomName: roomName,
            workDuration: 5,
            role: CreepRole.DEFENDER,
            averageEnergyConsumptionProductionPerTick: energyUsePerTick,
        };
        const creepSpawnManagement: ColonyCreepSpawnManagement = {
            desiredAmount: 0,
            bodyBlueprint: body,
            memoryBlueprint: memory,
            important: true,
        };

        return creepSpawnManagement;
    }
}
