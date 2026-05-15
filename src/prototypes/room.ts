import { PathfindingUtils } from "../utils/pathfinding-utils";
import { ThreatAssessment } from "../utils/threat-assessment";
import { CreepRole } from "./types";

export class RoomExtras {
    public room: Room;

    public constructor(room: Room) {
        this.room = room;
    }

    public run(): void {
        this.visualizeReservations();
        const threat = ThreatAssessment.assess(this.room);
        const towers = this.room.find<StructureTower>(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_TOWER },
        });

        // 1. Emergency Safe Mode
        if (threat.isSpawnUnderAttack && this.room.controller && this.room.controller.my) {
            const defenders = this.room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === CreepRole.DEFENDER });
            if (defenders.length === 0) {
                this.room.controller.activateSafeMode();
            }
        }

        // 2. Tower Logic
        if (threat.totalHostiles > 0) {
            for (const tower of towers) {
                // Priority 1: Repair Rampart under attack with a creep inside
                const rampartUnderAttack = this.findRampartUnderAttack(tower);
                if (rampartUnderAttack) {
                    tower.repair(rampartUnderAttack);
                    continue;
                }

                // Priority 2: Heal a creep taking damage OR Attack weakest enemy
                const creepToHeal = this.findCreepToHeal();
                if (creepToHeal) {
                    tower.heal(creepToHeal);
                    continue;
                }

                if (threat.weakestHostile) {
                    tower.attack(threat.weakestHostile);
                    continue;
                }

                // Priority 3: Repair Wall taking damage
                const wallUnderAttack = this.findWallUnderAttack();
                if (wallUnderAttack) {
                    tower.repair(wallUnderAttack);
                    continue;
                }
            }
        } else {
            // Peace time tower logic - ONLY healing.
            // Repairing moved to Repairer creeps to conserve tower energy.
            const creepToHeal = this.findCreepToHeal();
            if (creepToHeal) {
                towers.forEach(t => t.heal(creepToHeal));
            }
        }
    }

    private findRampartUnderAttack(tower: StructureTower): StructureRampart | null {
        return tower.pos.findClosestByRange<StructureRampart>(FIND_MY_STRUCTURES, {
            filter: s =>
                s.structureType === STRUCTURE_RAMPART &&
                s.pos.lookFor(LOOK_CREEPS).length > 0 &&
                s.hits < s.hitsMax &&
                s.pos.findInRange(FIND_HOSTILE_CREEPS, 3).length > 0,
        });
    }

    private findCreepToHeal(): Creep | null {
        return (
            this.room.find(FIND_MY_CREEPS, {
                filter: c => c.hits < c.hitsMax,
            })[0] || null
        );
    }

    private findWallUnderAttack(): StructureWall | null {
        return (
            this.room.find<StructureWall>(FIND_STRUCTURES, {
                filter: s =>
                    s.structureType === STRUCTURE_WALL &&
                    s.hits < s.hitsMax &&
                    s.pos.findInRange(FIND_HOSTILE_CREEPS, 3).length > 0,
            })[0] || null
        );
    }

    public visualizeReservations(): void {
        if (!this.room.memory || !this.room.memory.positionReservations) {
            return;
        }

        for (const position in this.room.memory.positionReservations) {
            const reservation = this.room.memory.positionReservations[position];
            PathfindingUtils.unreservePositions(this.room, reservation.pos);

            if (reservation.reservations.length > 0) {
                this.room.visual.circle(reservation.pos.x, reservation.pos.y);
                if (reservation.reservations.length > 1) {
                    this.room.visual.text(
                        reservation.reservations.length.toString(),
                        reservation.pos.x,
                        reservation.pos.y,
                    );
                }
            }
        }
    }
}
