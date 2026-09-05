/* eslint-disable max-classes-per-file */
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";

import { CombatBody } from "utils/combat-body";
import { CombatCreep } from "./combat-creep";
import { CombatIntel } from "utils/combat-intel";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { isDefendedRoom } from "utils/defense-scope";
import { EnergyCalculator } from "utils/energy-calculator";
import { RoomUtils } from "utils/room-utils";

/**
 * Kiting defender: shoots the squad focus target while holding range 3 from anything
 * that can hit back in melee, so slow boosted attackers never land a swing.
 */
export class RangedDefenderCreep extends CombatCreep {
    public constructor(creep: Creep) {
        super(creep);
    }

    public override onRun(): void {
        const { creep } = this;

        if (this.travelToHomeRoom()) return;

        // Grab a ranged boost first if a lab has one ready
        if (this.tryBoost(RANGED_ATTACK)) return;

        const squad = this.getSquad();

        if (squad.hostiles.length === 0) {
            this.handleNoHostiles();
            return;
        }

        this.applyHealSupport(squad.members);

        // Shoot first, then move: the shot is free either way.
        const target = squad.focus ?? creep.pos.findClosestByRange(squad.hostiles);
        this.shoot(target, squad.hostiles);

        if (!squad.engaged) {
            creep.say("hold");
            this.fallBackTo(squad.rally, 3, squad.hostiles);
            return;
        }

        if (!target) return;
        this.holdFiringPosition(target, squad.hostiles);
    }

    /** Fires at the focus target, switching to mass attack when the enemy is packed in close. */
    private shoot(target: Creep | null, hostiles: Creep[]): void {
        const { creep } = this;

        if (CombatIntel.shouldMassAttack(creep, hostiles)) {
            creep.rangedMassAttack();
            return;
        }

        if (target && creep.pos.inRangeTo(target, 3)) {
            creep.rangedAttack(target);
            return;
        }

        // Focus target is out of reach; do not waste the tick if something else is in range.
        const inRange = hostiles.filter(h => creep.pos.inRangeTo(h, 3));
        if (inRange.length > 0) {
            const fallback = CombatIntel.selectTarget(creep.pos, inRange, { hostiles, engageRange: 3 });
            if (fallback) {
                creep.rangedAttack(fallback);
            }
        }
    }

    /** Keeps the target at firing range while staying out of reach of melee. */
    private holdFiringPosition(target: Creep, hostiles: Creep[]): void {
        const { creep } = this;

        // A rampart in firing range beats kiting: nothing can hit us there.
        const rampart = this.findCombatRampart(target, 3);
        if (rampart) {
            if (!creep.pos.isEqualTo(rampart.pos)) {
                this.moveToWithReservation(rampart, creep.memory.workDuration, 0);
            }
            return;
        }

        if (this.isOnOwnRampart()) return; // Safe where we stand

        // Step to whichever nearby tile takes the least fire while still holding the
        // target in range. This backs off melee without ever losing the shot.
        const inDanger = CombatIntel.incomingDamageAt(creep.pos, hostiles) > 0;
        if (inDanger && this.repositionSafely(hostiles, { anchor: target.pos, anchorRange: 3, minHostileRange: 3 })) {
            return;
        }

        if (!creep.pos.inRangeTo(target, 3)) {
            this.moveToWithReservation(target, creep.memory.workDuration, 3);
        }
    }

    /** No hostile creeps left: clean up invader cores and stand down. */
    private handleNoHostiles(): void {
        const { creep } = this;
        const structure = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
            filter: RoomUtils.isDefenseTarget,
        });

        if (structure) {
            if (creep.rangedAttack(structure) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(structure, creep.memory.workDuration, 3);
            }
            return;
        }

        this.clearAlert();
        if (creep.hits < creep.hitsMax) {
            this.applyHealSupport([]);
        }
    }
}

export class RangedDefenderCreepSpawner extends CreepSpawnerImpl {
    public onCreateProfiles(_energyCap: number, colony: ColonyManager): CreepProfiles {
        const rooms = colony.colonyInfo.rooms;
        const profiles: CreepProfiles = {};

        for (const roomName in rooms) {
            const roomInfo = rooms[roomName];
            if (roomInfo.alertLevel <= 0) continue;
            if (!isDefendedRoom(colony.colonyInfo, roomInfo.name)) continue;

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

        const body = CombatBody.build(RANGED_ATTACK, targetEnergy, CombatBody.RANGED_RATIO);
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
