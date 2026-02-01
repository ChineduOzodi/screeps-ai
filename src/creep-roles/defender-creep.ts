/* eslint-disable max-classes-per-file */
import { CreepProfiles, CreepRole, CreepRunner } from "prototypes/creep";

import { ColonyManager } from "prototypes/colony";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { Movement } from "infrastructure/movement";

const BASE_DEFENDER = [TOUGH, MOVE, ATTACK];

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
                this.moveToWithReservation(target, creep.memory.workDuration);
            }
        }
    }
}

export class DefenderCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(energyCap: number, colony: ColonyManager): CreepProfiles {
        const rooms = colony.colonyInfo.rooms;
        const profiles: CreepProfiles = {};
        for (const roomInfo of rooms) {
            const profileName = `${CreepRole.DEFENDER}-${roomInfo.name}`;
            profiles[profileName] = this.createDefenderProfile(roomInfo.name, colony);
            const room = Game.rooms[roomInfo.name];
            const towers = room.find<StructureTower>(FIND_MY_STRUCTURES, {
                filter: { structureType: STRUCTURE_TOWER },
            });
            const enemyCount = room.find(FIND_HOSTILE_CREEPS).length;
            roomInfo.alertLevel = enemyCount;
            if (roomInfo.alertLevel > 0 && towers.length === 0) {
                profiles[profileName].desiredAmount = roomInfo.alertLevel + 1;
            } else {
                profiles[profileName].desiredAmount = Math.max(0, roomInfo.alertLevel - towers.length);
            }
        }
        return profiles;
    }

    private createDefenderProfile(roomName: string, colony: ColonyManager): CreepSpawnerProfileInfo {
        const room = colony.getMainRoom();
        let energy = room.energyCapacityAvailable;
        if (colony.systems.energy.noEnergyCollectors()) {
            energy = room.energyAvailable;
        }

        const numberOfParts = Math.max(1, Math.floor(energy / CreepSpawnerImpl.getSpawnBodyEnergyCost(BASE_DEFENDER)));
        const body = CreepSpawnerImpl.multiplyBody(BASE_DEFENDER, numberOfParts);

        const memory: AddCreepToQueueOptions = {
            homeRoomName: roomName,
            workDuration: 5,
            role: CreepRole.DEFENDER,
            averageEnergyConsumptionProductionPerTick: 0,
        };
        const creepSpawnManagement: CreepSpawnerProfileInfo = {
            desiredAmount: 0,
            bodyBlueprint: body,
            memoryBlueprint: memory,
            priority: 10,
        };

        return creepSpawnManagement;
    }
}
