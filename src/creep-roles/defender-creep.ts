/* eslint-disable max-classes-per-file */
import { CreepRunner } from "prototypes/creep";
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";

import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { EnergyCalculator } from "utils/energy-calculator";

import { ThreatAssessment } from "utils/threat-assessment";

const BASE_DEFENDER = [TOUGH, MOVE, ATTACK];

export class DefenderCreep extends CreepRunner {
    public override onRun(): void {
        this.runDefenderCreep();
    }

    public runDefenderCreep(): void {
        const creep = this.creep;
        const targetRoomName = creep.memory.homeRoomName;

        // If we are not in our target room, move there
        if (targetRoomName && creep.room.name !== targetRoomName) {
            this.moveToWithReservation({ pos: new RoomPosition(25, 25, targetRoomName) }, 0, 20);
            return;
        }

        const threat = ThreatAssessment.assess(this.creep.room);

        // Kill healers first — they keep everything else alive. Then fall back to the weakest hostile.
        const healers = threat.hostiles.filter(h => h.getActiveBodyparts(HEAL) > 0);
        let target: AnyCreep | Structure | null =
            healers.length > 0 ? this.creep.pos.findClosestByRange(healers) : threat.weakestHostile;

        if (!target) {
            target = this.creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                filter: s => s.structureType !== STRUCTURE_CONTROLLER,
            });
        }

        if (target) {
            if (this.attack(target) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(target, creep.memory.workDuration);
            }
        } else {
            // No targets found in the target room. Reset alert level
            if (targetRoomName && this.colony && this.colony.colonyInfo.rooms[targetRoomName]) {
                this.colony.colonyInfo.rooms[targetRoomName].alertLevel = 0;
            }
        }
    }
}

export class DefenderCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(energyCap: number, colony: ColonyManager): CreepProfiles {
        const rooms = colony.colonyInfo.rooms;
        const profiles: CreepProfiles = {};
        for (const roomName in rooms) {
            const roomInfo = rooms[roomName];

            const profileName = `${CreepRole.DEFENDER}-${roomInfo.name}`;

            if (roomInfo.alertLevel > 0) {
                const room = Game.rooms[roomInfo.name];
                let towersCount = 0;
                if (room) {
                    const towers = room.find<StructureTower>(FIND_MY_STRUCTURES, {
                        filter: { structureType: STRUCTURE_TOWER },
                    });
                    towersCount = towers.length;
                }

                // Determine desired amount based on threat and towers
                const desiredAmount = Math.max(1, roomInfo.alertLevel - Math.floor(towersCount / 2));

                profiles[profileName] = this.createDefenderProfile(roomInfo.name, colony);
                profiles[profileName].desiredAmount = desiredAmount;
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

        // Response Tiers:
        // 1. Initial/Small: If we have NO defenders, spawn a small one fast.
        // 2. Proportional: Scale to match threat.
        const currentDefenders = colony.getCreepCount(CreepRole.DEFENDER);
        let targetEnergy = energy;

        if (currentDefenders === 0) {
            targetEnergy = Math.min(energy, 600); // Quick response
        } else {
            // Cap at 30 parts (approx 1500-2500 energy) to keep spawn times reasonable
            targetEnergy = Math.min(energy, 2500);
        }

        const numberOfParts = Math.max(
            1,
            Math.floor(targetEnergy / CreepSpawnerImpl.getSpawnBodyEnergyCost(BASE_DEFENDER)),
        );
        const body = CreepSpawnerImpl.multiplyBody(BASE_DEFENDER, numberOfParts);

        const cost = EnergyCalculator.calculateBodyCost(body);
        const consumption = cost / CREEP_LIFE_TIME;

        const memory: AddCreepToQueueOptions = {
            homeRoomName: roomName,
            workDuration: 5,
            role: CreepRole.DEFENDER,
            averageEnergyConsumptionProductionPerTick: consumption,
        };

        return {
            desiredAmount: 0,
            bodyBlueprint: body,
            memoryBlueprint: memory,
            priority: 10,
        };
    }
}
