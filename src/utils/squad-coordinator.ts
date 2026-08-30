import { CombatIntel } from "./combat-intel";
import { CreepRole } from "prototypes/types";
import { ThreatAssessment } from "./threat-assessment";

/** Everything the combat roles need to fight as one group instead of as individuals. */
export interface Squad {
    roomName: string;
    /** Melee and ranged defenders in the room. */
    fighters: Creep[];
    /** Dedicated healers in the room. */
    healers: Creep[];
    /** Fighters and healers together. */
    members: Creep[];
    hostiles: Creep[];
    /** The hostile the whole squad shoots this tick, so damage outpaces enemy healing. */
    focus: Creep | null;
    /** Where the squad gathers when it is not strong enough to fight yet. */
    rally: RoomPosition;
    /** False means hold at the rally point and wait for reinforcements. */
    engaged: boolean;
    /** Damage per tick the squad can put on one target (used to spot un-killable heal tanks). */
    squadDamage: number;
    ourPower: number;
    hostilePower: number;
}

export interface EngagementInput {
    ourPower: number;
    hostilePower: number;
    /** Whether the squad was already committed last tick (adds hysteresis). */
    wasEngaged: boolean;
    /** Hostiles have reached the base core, so holding back gains nothing. */
    coreBreached: boolean;
    /** Our buildings are being chewed on right now. */
    structuresUnderAttack: boolean;
    /** A hostile is already close enough that disengaging just gives away free hits. */
    inContact: boolean;
    /** Raiders are cutting down our workers, who cannot fight back or run. */
    civiliansUnderAttack: boolean;
}

interface SquadCache {
    tick: number;
    squads: { [roomName: string]: Squad };
}

const FIGHTER_ROLES: string[] = [CreepRole.DEFENDER, CreepRole.RANGED_DEFENDER];

/**
 * Builds one shared picture of the fight per room per tick: who is on our side, what
 * we are all shooting, whether we are strong enough to commit, and where to fall back to.
 *
 * Without this every defender picks its own target and charges in alone; with it they
 * focus one hostile at a time and only leave cover when the group can win the trade.
 */
export class SquadCoordinator {
    /** Fraction of enemy power we need before committing (we also have towers and ramparts). */
    private static readonly ENGAGE_RATIO = 0.8;
    /** Once committed we keep fighting down to this fraction, so we do not flip-flop. */
    private static readonly DISENGAGE_RATIO = 0.5;
    /** How close a hostile has to be to count as contact. */
    private static readonly CONTACT_RANGE = 3;
    /** How close a hostile has to get to the core before we stop holding back. */
    private static readonly CORE_RANGE = 7;
    /** A new target has to beat the current focus by this much before the squad switches. */
    private static readonly FOCUS_SWITCH_MARGIN = 100;

    private static cache: SquadCache = { tick: -1, squads: {} };

    /** The squad for a room, built once per tick and reused by every combat creep in it. */
    public static get(room: Room): Squad {
        if (SquadCoordinator.cache.tick !== Game.time) {
            SquadCoordinator.cache = { tick: Game.time, squads: {} };
        }

        const cached = SquadCoordinator.cache.squads[room.name];
        if (cached) return cached;

        const squad = SquadCoordinator.build(room);
        SquadCoordinator.cache.squads[room.name] = squad;
        return squad;
    }

    private static build(room: Room): Squad {
        const hostiles = room.find(FIND_HOSTILE_CREEPS);
        const myCreeps = room.find(FIND_MY_CREEPS);
        const fighters = myCreeps.filter(c => FIGHTER_ROLES.includes(c.memory.role));
        const healers = myCreeps.filter(c => c.memory.role === CreepRole.HEALER);
        const members = [...fighters, ...healers];

        const towers = room.find<StructureTower>(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_TOWER },
        });

        const rally = SquadCoordinator.findRally(room, towers);
        const memory = SquadCoordinator.memory(room.name);

        const squadDamage = CombatIntel.groupDamage(fighters);
        const towerSupport = hostiles.length > 0 ? ThreatAssessment.totalTowerDamage(towers, hostiles[0].pos) : 0;
        const ourPower = CombatIntel.groupPower(members) + towerSupport;
        const hostilePower = CombatIntel.groupPower(hostiles);

        const engaged = SquadCoordinator.shouldEngage({
            ourPower,
            hostilePower,
            wasEngaged: memory.engaged,
            coreBreached: SquadCoordinator.isCoreBreached(rally, hostiles),
            structuresUnderAttack: SquadCoordinator.areStructuresUnderAttack(room, hostiles),
            inContact: SquadCoordinator.isInContact(members, hostiles),
            civiliansUnderAttack: SquadCoordinator.areCiviliansUnderAttack(myCreeps, members, hostiles),
        });

        const focus = SquadCoordinator.pickFocus(members, hostiles, squadDamage, memory);

        memory.engaged = engaged;
        memory.focusTargetId = focus?.id;
        memory.updated = Game.time;

        return {
            roomName: room.name,
            fighters,
            healers,
            members,
            hostiles,
            focus,
            rally,
            engaged,
            squadDamage,
            ourPower,
            hostilePower,
        };
    }

    /**
     * Whether the squad commits or holds. Holding is only useful while the enemy is
     * outside the base and not eating our buildings; anywhere else, waiting just means
     * dying later with the same creeps.
     */
    public static shouldEngage(input: EngagementInput): boolean {
        if (input.hostilePower <= 0) return true;
        // Holding is only worth it while holding protects something. Once the enemy is in
        // the base, on our buildings, on our workers, or already on us, waiting costs more
        // than the fight does.
        if (input.coreBreached || input.structuresUnderAttack || input.inContact) return true;
        if (input.civiliansUnderAttack) return true;

        const ratio = input.wasEngaged ? SquadCoordinator.DISENGAGE_RATIO : SquadCoordinator.ENGAGE_RATIO;
        return input.ourPower >= input.hostilePower * ratio;
    }

    /** The hostile the squad focuses, sticky across ticks so damage is not spread around. */
    private static pickFocus(
        members: Creep[],
        hostiles: Creep[],
        squadDamage: number,
        memory: SquadMemory,
    ): Creep | null {
        if (hostiles.length === 0) return null;

        const from = members.length > 0 ? members[0].pos : hostiles[0].pos;
        const opts = { hostiles, squadDamage, engageRange: 1 };

        const best = CombatIntel.selectTarget(from, hostiles, opts);
        if (!best) return null;

        const previous = memory.focusTargetId ? hostiles.find(h => h.id === memory.focusTargetId) : undefined;
        if (previous && previous.id !== best.id) {
            const previousScore = CombatIntel.scoreTarget(from, previous, opts);
            const bestScore = CombatIntel.scoreTarget(from, best, opts);
            if (bestScore - previousScore < SquadCoordinator.FOCUS_SWITCH_MARGIN) {
                return previous;
            }
        }

        return best;
    }

    /** Gathering point: next to a tower if we have one, else the spawn, else the room center. */
    private static findRally(room: Room, towers: StructureTower[]): RoomPosition {
        if (towers.length > 0) return towers[0].pos;

        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (spawn) return spawn.pos;

        if (room.controller) return room.controller.pos;
        return new RoomPosition(25, 25, room.name);
    }

    private static isCoreBreached(rally: RoomPosition, hostiles: Creep[]): boolean {
        return hostiles.some(h => rally.getRangeTo(h.pos) <= SquadCoordinator.CORE_RANGE);
    }

    private static isInContact(members: Creep[], hostiles: Creep[]): boolean {
        return members.some(m => hostiles.some(h => m.pos.getRangeTo(h.pos) <= SquadCoordinator.CONTACT_RANGE));
    }

    /** True when a worker (anything that cannot fight) is hurt or inside enemy reach. */
    private static areCiviliansUnderAttack(myCreeps: Creep[], members: Creep[], hostiles: Creep[]): boolean {
        const memberIds = new Set(members.map(m => m.id));
        return myCreeps.some(
            c => !memberIds.has(c.id) && (c.hits < c.hitsMax || CombatIntel.incomingDamageAt(c.pos, hostiles) > 0),
        );
    }

    private static areStructuresUnderAttack(room: Room, hostiles: Creep[]): boolean {
        if (hostiles.length === 0) return false;
        const damaged = room.find(FIND_MY_STRUCTURES, {
            filter: s =>
                s.hits < s.hitsMax &&
                (s.structureType === STRUCTURE_SPAWN ||
                    s.structureType === STRUCTURE_TOWER ||
                    s.structureType === STRUCTURE_STORAGE ||
                    s.structureType === STRUCTURE_TERMINAL ||
                    s.structureType === STRUCTURE_EXTENSION),
        });
        return damaged.length > 0;
    }

    /** The squad member most in need of healing, fighters before healers. */
    public static findPatient(squad: Squad, healer: Creep): Creep | null {
        const wounded = squad.members.filter(c => c.hits < c.hitsMax && c.id !== healer.id);
        if (wounded.length === 0) return null;

        let best: Creep | null = null;
        let bestScore = -Infinity;
        for (const creep of wounded) {
            const missing = 1 - creep.hits / creep.hitsMax;
            // Fighters first: keeping the line alive is what buys the healer its own safety.
            const roleWeight = FIGHTER_ROLES.includes(creep.memory.role) ? 1.5 : 1;
            const range = healer.pos.getRangeTo(creep.pos);
            const score = missing * 100 * roleWeight - range * 2;
            if (score > bestScore) {
                bestScore = score;
                best = creep;
            }
        }
        return best;
    }

    /** Squad state that has to survive between ticks. */
    public static memory(roomName: string): SquadMemory {
        if (!Memory.squads) {
            Memory.squads = {};
        }
        if (!Memory.squads[roomName]) {
            Memory.squads[roomName] = { engaged: false, updated: Game.time };
        }
        return Memory.squads[roomName];
    }

    /** Drops squad memory for rooms that have been quiet for a while. */
    public static cleanup(maxAge = 100): void {
        if (!Memory.squads) return;
        for (const roomName in Memory.squads) {
            if (Game.time - Memory.squads[roomName].updated > maxAge) {
                delete Memory.squads[roomName];
            }
        }
    }
}
