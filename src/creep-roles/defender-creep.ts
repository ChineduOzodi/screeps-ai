/* eslint-disable max-classes-per-file */
import { ColonyManager, CreepProfiles, CreepRole } from "prototypes/types";

import { CombatBody } from "utils/combat-body";
import { CombatCreep } from "./combat-creep";
import { CombatIntel } from "utils/combat-intel";
import { CreepSpawnerImpl } from "prototypes/CreepSpawner";
import { EnergyCalculator } from "utils/energy-calculator";
import { RoomUtils } from "utils/room-utils";
import { isDefendedRoom } from "utils/defense-scope";

export class DefenderCreep extends CombatCreep {
    public override onRun(): void {
        this.runDefenderCreep();
    }

    public runDefenderCreep(): void {
        const { creep } = this;

        if (this.travelToHomeRoom()) return;

        // Grab an attack boost first if a lab has one ready
        if (this.tryBoost(ATTACK)) return;

        const squad = this.getSquad();

        if (squad.hostiles.length === 0) {
            this.handleNoHostiles();
            return;
        }

        // HEAL parts sit at the tail of the body precisely so a wounded fighter can still
        // use them; healing is a separate intent from attacking, so this costs us nothing.
        this.applyHealSupport(squad.members);

        // Whatever is already on top of us gets hit. Walking away from an adjacent
        // attacker to reach a "better" target just hands it free swings at our back.
        const adjacent = CombatIntel.mostDangerousInRange(creep, squad.hostiles, 1);
        if (adjacent) {
            this.fightAdjacent(adjacent, squad.hostiles);
            return;
        }

        // The squad holds together: if we are not strong enough to win the trade yet,
        // or we are nearly dead and have healers behind us, fall back under tower cover.
        const shouldHoldBack = !squad.engaged || (this.isBadlyWounded() && squad.healers.length > 0);
        if (shouldHoldBack) {
            creep.say(squad.engaged ? "patch" : "hold");
            this.fallBackTo(squad.rally, 3, squad.hostiles);
            return;
        }

        const target = squad.focus ?? creep.pos.findClosestByRange(squad.hostiles);
        if (!target) return;

        this.engage(target, squad.hostiles);
    }

    /** Fights something we are already touching, taking a rampart next to it when one is free. */
    private fightAdjacent(target: Creep, hostiles: Creep[]): void {
        const { creep } = this;
        creep.attack(target);

        if (this.isOnOwnRampart()) return;

        const rampart = this.findCombatRampart(target, 1);
        if (rampart && creep.pos.isNearTo(rampart.pos)) {
            this.stepTo(rampart.pos);
            return;
        }

        // No cover: at least stand where the rest of the enemy group can hit us least.
        this.repositionSafely(hostiles, { anchor: target.pos, anchorRange: 1 });
    }

    /** Closes on the squad focus target, fighting from a rampart when one is in reach. */
    private engage(target: Creep, hostiles: Creep[]): void {
        const { creep } = this;

        // Fighting from a rampart is always better: attackers cannot hit us through it.
        const rampart = this.findCombatRampart(target, 1);
        if (rampart) {
            if (!creep.pos.isEqualTo(rampart.pos)) {
                this.moveToWithReservation(rampart, creep.memory.workDuration, 0);
            }
            if (creep.pos.isNearTo(target)) {
                this.attack(target);
            }
            return;
        }

        if (this.attack(target) === ERR_NOT_IN_RANGE) {
            // Close range: pick the approach tile that eats the least crossfire from the
            // hostiles standing around the target. Further out, just path toward it.
            if (
                creep.pos.getRangeTo(target.pos) <= 3 &&
                this.repositionSafely(hostiles, {
                    anchor: target.pos,
                    anchorRange: 1,
                })
            ) {
                return;
            }
            this.moveToWithReservation(target, creep.memory.workDuration);
        }
    }

    /** No hostile creeps left: clean up invader cores and stand down. */
    private handleNoHostiles(): void {
        const { creep } = this;
        const structure = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
            filter: RoomUtils.isDefenseTarget,
        });

        if (structure) {
            if (this.attack(structure) === ERR_NOT_IN_RANGE) {
                this.moveToWithReservation(structure, creep.memory.workDuration);
            }
            return;
        }

        this.clearAlert();
        if (creep.hits < creep.hitsMax) {
            this.applyHealSupport([]);
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

            // Only rooms the colony uses get a response; a hostile in a scouted-but-idle
            // room (or one walled off by a zone boundary) is noted, not fought.
            if (roomInfo.alertLevel > 0 && isDefendedRoom(colony.colonyInfo, roomInfo.name)) {
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
            // Cap the spend so spawn times stay reasonable; the 50 part limit caps it again.
            targetEnergy = Math.min(energy, 2500);
        }

        const body = CombatBody.build(ATTACK, targetEnergy, CombatBody.MELEE_RATIO);

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
