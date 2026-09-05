/* eslint-disable max-classes-per-file */
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";

import { CombatBody } from "utils/combat-body";
import { CombatCreep } from "./combat-creep";
import { CombatIntel } from "utils/combat-intel";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { isDefendedRoom } from "utils/defense-scope";
import { EnergyCalculator } from "utils/energy-calculator";
import { SquadCoordinator } from "utils/squad-coordinator";

/**
 * Support creep. It has no weapons, so its entire job is to stay alive and in range:
 * it heals from behind the fighters, never walks into melee reach, and runs for cover
 * when there is nothing left to heal.
 */
export class HealerCreep extends CombatCreep {
    /** Distance we try to keep from anything that can hurt us while still healing. */
    private static readonly SAFE_DISTANCE = 4;

    public override onRun(): void {
        const { creep } = this;
        const squad = this.getSquad();
        const hostiles = squad.hostiles;

        const patient = SquadCoordinator.findPatient(squad, creep);
        this.applyHeal(patient);

        if (hostiles.length === 0) {
            this.peacetime(patient);
            return;
        }

        // Nothing to heal but enemies about: we are only a target here.
        if (!patient) {
            creep.say("cover");
            this.fallBackTo(squad.rally, 3, hostiles);
            return;
        }

        this.keepStation(patient, hostiles, squad.rally);
    }

    /** Heals the best patient in range, falling back to patching ourselves up. */
    private applyHeal(patient: Creep | null): void {
        const { creep } = this;

        if (patient) {
            const range = creep.pos.getRangeTo(patient.pos);
            if (range <= 1) {
                creep.heal(patient);
                return;
            }
            if (range <= 3) {
                creep.rangedHeal(patient);
                return;
            }
        }

        if (creep.hits < creep.hitsMax) {
            creep.heal(creep);
        }
    }

    /**
     * Holds a spot that keeps the patient in heal range while taking the least fire.
     * Healing at range 3 is weaker than touching the patient, but a dead healer heals nothing.
     */
    private keepStation(patient: Creep, hostiles: Creep[], rally: RoomPosition): void {
        const { creep } = this;

        if (this.isOnOwnRampart() && creep.pos.inRangeTo(patient, 3)) return;

        const rampart = this.findCombatRampart(patient, 3);
        if (rampart) {
            if (!creep.pos.isEqualTo(rampart.pos)) {
                this.moveToWithReservation(rampart, creep.memory.workDuration, 0);
            }
            return;
        }

        const exposure = CombatIntel.incomingDamageAt(creep.pos, hostiles);
        if (exposure > 0 || this.isBadlyWounded(0.5)) {
            // Back out of reach without dropping out of heal range of the patient.
            if (
                this.repositionSafely(hostiles, {
                    anchor: patient.pos,
                    anchorRange: 3,
                    minHostileRange: HealerCreep.SAFE_DISTANCE,
                })
            ) {
                return;
            }
            // Boxed in and still being shot: give up the station and run for cover.
            if (exposure > 0) {
                creep.say("run");
                this.fallBackTo(rally, 3, hostiles);
                return;
            }
        }

        // Safe where we are: close in only if the patient is out of heal range, and only
        // to a tile that is not inside the enemy's reach.
        if (!creep.pos.inRangeTo(patient, 3)) {
            const approach = CombatIntel.findSafeStep(creep, hostiles, {
                anchor: patient.pos,
                anchorRange: creep.pos.getRangeTo(patient.pos) - 1,
                minHostileRange: HealerCreep.SAFE_DISTANCE,
            });
            if (approach) {
                this.stepTo(approach);
                return;
            }
            this.moveToWithReservation(patient, creep.memory.workDuration, 3);
        }
    }

    /** No hostiles in the room: top the squad up and go back to the home room. */
    private peacetime(patient: Creep | null): void {
        const { creep } = this;

        // Only worth walking to a lab while nothing is shooting at us.
        if (this.tryBoost(HEAL)) return;

        if (patient && !creep.pos.inRangeTo(patient, 1)) {
            this.moveToWithReservation(patient, creep.memory.workDuration, 1);
            return;
        }

        if (!patient) {
            this.travelToHomeRoom();
        }
    }
}

export class HealerCreepSpawner extends CreepSpawnerImpl {
    /** Healers per fighter. Too many and we out-spend the threat; too few and the line melts. */
    private static readonly HEALERS_PER_FIGHTER = 0.5;
    private static readonly MAX_HEALERS = 3;

    public onCreateProfiles(energyCap: number, colony: ColonyManager): CreepProfiles {
        const rooms = colony.colonyInfo.rooms;
        const profiles: CreepProfiles = {};

        const fighterCount = colony.getCreepCount(CreepRole.DEFENDER) + colony.getCreepCount(CreepRole.RANGED_DEFENDER);

        for (const roomName in rooms) {
            const roomInfo = rooms[roomName];
            if (roomInfo.alertLevel <= 0 || fighterCount < 1) continue;
            if (!isDefendedRoom(colony.colonyInfo, roomInfo.name)) continue;

            // One healer keeps a fighter in the fight far longer than a second fighter does,
            // so pair them up as soon as there is a line to support.
            const desiredAmount = Math.min(
                HealerCreepSpawner.MAX_HEALERS,
                Math.max(1, Math.round(fighterCount * HealerCreepSpawner.HEALERS_PER_FIGHTER)),
            );

            const profileName = `${CreepRole.HEALER}-${roomInfo.name}`;
            profiles[profileName] = this.createHealerProfile(roomInfo.name, colony);
            profiles[profileName].desiredAmount = desiredAmount;
        }
        return profiles;
    }

    private createHealerProfile(roomName: string, colony: ColonyManager): CreepSpawnerProfileInfo {
        const room = colony.getMainRoom();
        let energy = room.energyCapacityAvailable;
        if (colony.systems.energy.noEnergyCollectors()) {
            energy = room.energyAvailable;
        }

        // Cap the spend so spawn times stay reasonable.
        const targetEnergy = Math.min(energy, 2000);
        const body = CombatBody.build(HEAL, targetEnergy, CombatBody.HEALER_RATIO);

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
