import { RAMPART_TOPUP_HITS, TOWER_REPAIR_MIN_ENERGY_FRACTION } from "../constants/repair-constants";
import { CpuBudget } from "../utils/cpu-budget";
import { PathfindingUtils } from "../utils/pathfinding-utils";
import { SafeModeGuard } from "../utils/safe-mode";
import { ThreatAssessment } from "../utils/threat-assessment";
import { RoomOverlay } from "../visuals/room-overlay";

export class RoomExtras {
    public room: Room;

    public constructor(room: Room) {
        this.room = room;
    }

    public run(): void {
        if (CpuBudget.optionalAllowed()) {
            this.visualizeReservations();
            RoomOverlay.drawRoom(this.room);
        }
        const threat = ThreatAssessment.assess(this.room);
        const towers = this.room.find<StructureTower>(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_TOWER },
        });

        // 1. Emergency Safe Mode. Fires while there is still a base to save: attackers
        // inside the core that our towers and defenders cannot out-damage.
        if (threat.totalHostiles > 0) {
            SafeModeGuard.run(this.room, threat, towers);
        }

        // 2. Tower Logic
        if (threat.totalHostiles > 0) {
            // Focus fire: all towers shoot the same target so damage can outpace healing.
            const focusTarget = ThreatAssessment.selectTowerTarget(towers, threat);

            for (const tower of towers) {
                // Priority 1: Repair Rampart under attack with a creep inside
                const rampartUnderAttack = this.findRampartUnderAttack(tower);
                if (rampartUnderAttack) {
                    tower.repair(rampartUnderAttack);
                    continue;
                }

                if (focusTarget) {
                    tower.attack(focusTarget);
                    continue;
                }

                // No killable target (heal-tanks out-heal us). Only waste energy on hostiles
                // that are actively threatening structures at close range.
                const closeHostile = tower.pos.findInRange(FIND_HOSTILE_CREEPS, TOWER_OPTIMAL_RANGE)[0];
                if (closeHostile) {
                    tower.attack(closeHostile);
                    continue;
                }

                // Priority 2: Heal a creep taking damage
                const creepToHeal = this.findCreepToHeal();
                if (creepToHeal) {
                    tower.heal(creepToHeal);
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
            // Peace time: heal, then keep ramparts from decaying away. Everything else is
            // left to the repairer creeps to conserve tower energy.
            const creepToHeal = this.findCreepToHeal();
            if (creepToHeal) {
                towers.forEach(t => t.heal(creepToHeal));
                return;
            }
            this.topUpRamparts(towers);
        }
    }

    /**
     * Has each tower with energy to spare repair the weakest rampart below RAMPART_TOPUP_HITS.
     * A fresh rampart starts at 1 hit and decays 300 every 100 ticks; the repairer is one
     * small creep that also looks after every road, so without this ramparts die and get
     * rebuilt in a loop.
     */
    public topUpRamparts(towers: StructureTower[]): void {
        if (towers.length === 0) return;
        const weak = this.room
            .find<StructureRampart>(FIND_MY_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_RAMPART && s.hits < RAMPART_TOPUP_HITS,
            })
            .sort((a, b) => a.hits - b.hits);
        if (weak.length === 0) return;

        towers.forEach((tower, index) => {
            const capacity = tower.store.getCapacity(RESOURCE_ENERGY) || 0;
            if (tower.store[RESOURCE_ENERGY] < capacity * TOWER_REPAIR_MIN_ENERGY_FRACTION) return;
            tower.repair(weak[index % weak.length]);
        });
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
            PathfindingUtils.unreservePositions(this.room.name, reservation.pos);

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
