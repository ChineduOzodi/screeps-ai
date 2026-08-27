/* eslint-disable max-classes-per-file */
import { CreepRunner } from "prototypes/creep";
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { EnergyCalculator } from "utils/energy-calculator";
import { ThreatAssessment } from "utils/threat-assessment";

const BASE_RANGED_DEFENDER: BodyPartConstant[] = [RANGED_ATTACK, MOVE];

/**
 * Kiting defender: keeps at range 3 from melee attackers while shooting,
 * so slow boosted melee creeps can never land a hit.
 */
export class RangedDefenderCreep extends CreepRunner {
    public constructor(creep: Creep) {
        super(creep);
    }

    public override onRun(): void {
        const { creep } = this;
        const targetRoomName = creep.memory.homeRoomName;

        if (targetRoomName && creep.room.name !== targetRoomName) {
            this.moveToWithReservation({ pos: new RoomPosition(25, 25, targetRoomName) }, 0, 20);
            return;
        }

        // Grab a ranged boost first if a lab has one ready
        if (this.tryBoost(RANGED_ATTACK)) return;

        const threat = ThreatAssessment.assess(creep.room);

        // Target priority: healers, then the weakest hostile
        const healers = threat.hostiles.filter(h => h.getActiveBodyparts(HEAL) > 0);
        const target: Creep | null = healers.length > 0 ? creep.pos.findClosestByRange(healers) : threat.weakestHostile;

        if (!target) {
            const hostileStructure = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                filter: s => s.structureType !== STRUCTURE_CONTROLLER,
            });
            if (hostileStructure) {
                if (creep.rangedAttack(hostileStructure) === ERR_NOT_IN_RANGE) {
                    this.moveToWithReservation(hostileStructure, creep.memory.workDuration, 3);
                }
            } else if (targetRoomName && this.colony && this.colony.colonyInfo.rooms[targetRoomName]) {
                this.colony.colonyInfo.rooms[targetRoomName].alertLevel = 0;
            }
            return;
        }

        // Shoot: mass attack when swarmed, otherwise focus the target
        const inCloseRange = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 1);
        if (inCloseRange.length >= 2) {
            creep.rangedMassAttack();
        } else if (creep.pos.inRangeTo(target, 3)) {
            creep.rangedAttack(target);
        }

        // Movement: kite away from anything that can melee us, else close to range 3
        const dangerClose = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 2, {
            filter: h => h.getActiveBodyparts(ATTACK) > 0,
        });

        if (dangerClose.length > 0) {
            this.fleeFrom(dangerClose[0]);
        } else if (!creep.pos.inRangeTo(target, 3)) {
            this.moveToWithReservation(target, creep.memory.workDuration, 3);
        }
    }

    private fleeFrom(hostile: Creep): void {
        const { creep } = this;
        const dir = creep.pos.getDirectionTo(hostile);
        // Opposite of dir (directions are 1..8 clockwise)
        const away = (((dir - 1 + 4) % 8) + 1) as DirectionConstant;
        creep.move(away);
        delete creep.memory.movementSystem?.path;
    }
}

export class RangedDefenderCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(_energyCap: number, colony: ColonyManager): CreepProfiles {
        const rooms = colony.colonyInfo.rooms;
        const profiles: CreepProfiles = {};

        for (const roomName in rooms) {
            const roomInfo = rooms[roomName];
            if (roomInfo.alertLevel <= 0) continue;

            // Melee defenders handle small incursions; ranged join for bigger ones.
            const desiredAmount = Math.floor(roomInfo.alertLevel / 2);
            if (desiredAmount <= 0) continue;

            const profileName = `${CreepRole.RANGED_DEFENDER}-${roomInfo.name}`;
            profiles[profileName] = this.createProfile(roomInfo.name, colony);
            profiles[profileName].desiredAmount = desiredAmount;
        }
        return profiles;
    }

    private createProfile(roomName: string, colony: ColonyManager): CreepSpawnerProfileInfo {
        const room = colony.getMainRoom();
        let energy = room.energyCapacityAvailable;
        if (colony.systems.energy.noEnergyCollectors()) {
            energy = room.energyAvailable;
        }
        const targetEnergy = Math.min(energy, 2000);

        const unitCost = CreepSpawnerImpl.getSpawnBodyEnergyCost(BASE_RANGED_DEFENDER);
        const units = Math.max(1, Math.floor(targetEnergy / unitCost));
        const body = CreepSpawnerImpl.multiplyBody(BASE_RANGED_DEFENDER, units);

        const cost = EnergyCalculator.calculateBodyCost(body);

        return {
            desiredAmount: 0,
            bodyBlueprint: body,
            memoryBlueprint: {
                homeRoomName: roomName,
                workTargetId: roomName,
                workDuration: 5,
                role: CreepRole.RANGED_DEFENDER,
                averageEnergyConsumptionProductionPerTick: cost / CREEP_LIFE_TIME,
            },
            priority: 10,
        };
    }
}
