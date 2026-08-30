import { CombatIntel } from "utils/combat-intel";
import { CreepRunner } from "prototypes/creep";
import { PathfindingUtils } from "utils/pathfinding-utils";
import { Squad, SquadCoordinator } from "utils/squad-coordinator";

/**
 * Shared behavior for the fighting roles: squad lookup, tactical stepping,
 * falling back, and using whatever HEAL parts the creep carries.
 */
export abstract class CombatCreep extends CreepRunner {
    /** The shared plan for this room this tick. */
    protected getSquad(): Squad {
        return SquadCoordinator.get(this.creep.room);
    }

    /** Moves toward the home room. Returns true when travelling, so callers can stop. */
    protected travelToHomeRoom(): boolean {
        const roomName = this.creep.memory.homeRoomName;
        if (!roomName || this.creep.room.name === roomName) return false;
        this.moveToWithReservation({ pos: new RoomPosition(25, 25, roomName) }, 0, 20);
        return true;
    }

    /** Clears the room alert once nothing hostile is left to fight. */
    protected clearAlert(): void {
        const roomName = this.creep.memory.homeRoomName;
        if (!roomName || !this.colony) return;
        const roomInfo = this.colony.colonyInfo.rooms[roomName];
        if (roomInfo) {
            roomInfo.alertLevel = 0;
        }
    }

    /**
     * Uses any HEAL parts on this creep. Melee and ranged attacks are separate intents
     * from healing, so a fighter with a HEAL part in its tail can patch itself (or the
     * creep next to it) in the same tick it attacks.
     */
    protected applyHealSupport(allies: Creep[]): boolean {
        const { creep } = this;
        if (creep.getActiveBodyparts(HEAL) === 0) return false;

        const candidates = allies.filter(c => c.id !== creep.id && c.hits < c.hitsMax);
        if (creep.hits < creep.hitsMax) {
            candidates.push(creep);
        }
        if (candidates.length === 0) return false;

        // Whoever is missing the most, adjacent first: heal is three times rangedHeal.
        const adjacent = candidates.filter(c => creep.pos.getRangeTo(c.pos) <= 1);
        const pool = adjacent.length > 0 ? adjacent : candidates.filter(c => creep.pos.getRangeTo(c.pos) <= 3);
        if (pool.length === 0) return false;

        const target = pool.reduce((worst, c) => (c.hits / c.hitsMax < worst.hits / worst.hitsMax ? c : worst));

        if (creep.pos.getRangeTo(target.pos) <= 1) {
            return creep.heal(target) === OK;
        }
        return creep.rangedHeal(target) === OK;
    }

    /**
     * Takes a single step now, bypassing the cached-path movement system. Combat
     * positioning changes every tick, so a stored path is worse than useless here.
     */
    protected stepTo(pos: RoomPosition): void {
        const { creep } = this;
        PathfindingUtils.unreserveAll(creep);
        delete creep.memory.movementSystem?.path;
        delete creep.memory.targetId;
        delete creep.memory.targetPos;
        creep.move(creep.pos.getDirectionTo(pos));
    }

    /**
     * Steps to the safest neighbouring tile, optionally staying within `anchorRange`
     * of something (a patient, or the hostile we are shooting). Returns true if we moved.
     */
    protected repositionSafely(
        hostiles: Creep[],
        opts: { anchor?: RoomPosition; anchorRange?: number; minHostileRange?: number } = {},
    ): boolean {
        const step = CombatIntel.findSafeStep(this.creep, hostiles, opts);
        if (!step) return false;
        this.stepTo(step);
        return true;
    }

    /** Falls back toward a position, preferring a rampart we can hold on the way. */
    protected fallBackTo(pos: RoomPosition, range: number, hostiles: Creep[]): void {
        const { creep } = this;

        // A rampart near the fallback point is better than the fallback point itself.
        const rampart = this.findCombatRampart({ pos }, range);
        if (rampart && !creep.pos.isEqualTo(rampart.pos)) {
            this.moveToWithReservation(rampart, creep.memory.workDuration, 0);
            return;
        }

        if (creep.pos.getRangeTo(pos) > range) {
            this.moveToWithReservation({ pos }, creep.memory.workDuration, range);
            return;
        }

        // Already back at the rally point: just avoid standing somewhere exposed.
        this.repositionSafely(hostiles, { anchor: pos, anchorRange: range, minHostileRange: 5 });
    }

    /** True when this creep is hurt enough that it should stop trading hits. */
    protected isBadlyWounded(threshold = 0.4): boolean {
        return this.creep.hits < this.creep.hitsMax * threshold;
    }
}
