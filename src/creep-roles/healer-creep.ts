/* eslint-disable max-classes-per-file */
import { CreepRunner } from "prototypes/creep";
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { EnergyCalculator } from "utils/energy-calculator";

const BASE_HEALER = [HEAL, MOVE];

export class HealerCreep extends CreepRunner {
    public override onRun(): void {
        const creep = this.creep;
        const target = this.findDefenderToHeal();

        if (target) {
            if (this.heal(target) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(target, 1);
            }
        } else if (creep.hits < creep.hitsMax) {
            creep.heal(creep);
        }
    }

    private findDefenderToHeal(): Creep | null {
        return this.creep.pos.findClosestByRange(FIND_MY_CREEPS, {
            filter: c =>
                (c.memory.role === CreepRole.DEFENDER || c.memory.role === CreepRole.HEALER) && c.hits < c.hitsMax,
        });
    }
}

export class HealerCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(energyCap: number, colony: ColonyManager): CreepProfiles {
        const rooms = colony.colonyInfo.rooms;
        const profiles: CreepProfiles = {};

        for (const roomInfo of rooms) {
            const room = Game.rooms[roomInfo.name];
            if (!room) continue;

            const profileName = `${CreepRole.HEALER}-${roomInfo.name}`;
            const defendersCount = colony.getCreepCount(CreepRole.DEFENDER);
            const healersCount = colony.getCreepCount(CreepRole.HEALER);
            const hostiles = room.find(FIND_HOSTILE_CREEPS);

            let desiredAmount = 0;
            if (hostiles.length > 0 && defendersCount >= 2) {
                desiredAmount = Math.floor(defendersCount / 2);
            }

            if (healersCount < desiredAmount) {
                profiles[profileName] = this.createHealerProfile(roomInfo.name, colony);
                profiles[profileName].desiredAmount = desiredAmount;
            }
        }
        return profiles;
    }

    private createHealerProfile(roomName: string, colony: ColonyManager): CreepSpawnerProfileInfo {
        const room = colony.getMainRoom();
        let energy = room.energyCapacityAvailable;
        if (colony.systems.energy.noEnergyCollectors()) {
            energy = room.energyAvailable;
        }

        // Limit size to avoid long spawn times, but enough to heal
        const maxParts = 10;
        const numberOfParts = Math.min(
            maxParts,
            Math.max(1, Math.floor(energy / CreepSpawnerImpl.getSpawnBodyEnergyCost(BASE_HEALER))),
        );
        const body = CreepSpawnerImpl.multiplyBody(BASE_HEALER, numberOfParts);

        const cost = EnergyCalculator.calculateBodyCost(body);
        const consumption = cost / CREEP_LIFE_TIME;

        const memory: AddCreepToQueueOptions = {
            homeRoomName: roomName,
            workDuration: 5,
            role: CreepRole.HEALER,
            averageEnergyConsumptionProductionPerTick: consumption,
        };

        return {
            desiredAmount: 0,
            bodyBlueprint: body,
            memoryBlueprint: memory,
            priority: 11, // Slightly lower priority than defenders so we get fighters first
        };
    }
}
