import { ThreatAssessment } from "./threat-assessment";

/** How a hostile is weighted when deciding what to shoot and where it is safe to stand. */
export interface TargetScoreOptions {
    /** Damage per tick the squad can put on a single target. Used to skip un-killable heal tanks. */
    squadDamage?: number;
    /** Range the attacker fights from: 1 for melee, 3 for ranged. */
    engageRange?: number;
    /** Hostiles other than the candidate, used to price crossfire on the approach. */
    hostiles?: Creep[];
}

/**
 * Battlefield math shared by the combat roles: what a hostile can do to us, how
 * dangerous a tile is, which hostile is worth attacking, and where to step to
 * take less damage.
 *
 * Everything here is read-only and side effect free so it can be unit tested and
 * called several times per tick without surprises.
 */
export class CombatIntel {
    /** Extra weight given to hostile healers, since they undo everything else we do. */
    private static readonly HEALER_PRIORITY = 250;
    /** Weight on finishing an already wounded hostile. */
    private static readonly FINISH_PRIORITY = 150;
    /**
     * Penalty for a target the squad cannot out-damage. Large enough to drop it below any
     * killable hostile, while every un-killable target takes the same hit so the least bad
     * one is still chosen when the whole enemy group out-heals us.
     */
    private static readonly UNKILLABLE_PENALTY = 2000;
    /** Penalty per point of damage taken from other hostiles while engaging this one. */
    private static readonly CROSSFIRE_WEIGHT = 0.6;
    /** Penalty per tile of approach beyond our engage range. */
    private static readonly TRAVEL_WEIGHT = 8;

    /**
     * Damage a hostile can land on something standing `range` tiles away on the next tick.
     * Assumes the hostile is allowed one move, so melee reaches range 2 and ranged reaches 4.
     */
    public static damageAtRange(hostile: Creep, range: number): number {
        let damage = 0;
        if (range <= 2) {
            damage += hostile.getActiveBodyparts(ATTACK) * ATTACK_POWER;
        }
        if (range <= 4) {
            damage += hostile.getActiveBodyparts(RANGED_ATTACK) * RANGED_ATTACK_POWER;
        }
        return damage;
    }

    /** Damage per tick we would take standing at `pos`, summed over every hostile that can reach it. */
    public static incomingDamageAt(pos: RoomPosition, hostiles: Creep[], ignore?: Creep): number {
        let damage = 0;
        for (const hostile of hostiles) {
            if (ignore && hostile.id === ignore.id) continue;
            damage += CombatIntel.damageAtRange(hostile, pos.getRangeTo(hostile.pos));
        }
        return damage;
    }

    /** How much of a problem a creep is: damage output, plus healing and utility parts. */
    public static threatValue(creep: Creep): number {
        return (
            creep.getActiveBodyparts(ATTACK) * ATTACK_POWER +
            creep.getActiveBodyparts(RANGED_ATTACK) * RANGED_ATTACK_POWER +
            creep.getActiveBodyparts(HEAL) * HEAL_POWER +
            creep.getActiveBodyparts(WORK) * DISMANTLE_POWER * 0.5 +
            creep.getActiveBodyparts(CLAIM) * 50
        );
    }

    /** Damage per tick a group can deal, ignoring range. */
    public static groupDamage(creeps: Creep[]): number {
        let damage = 0;
        for (const creep of creeps) {
            damage +=
                creep.getActiveBodyparts(ATTACK) * ATTACK_POWER +
                creep.getActiveBodyparts(RANGED_ATTACK) * RANGED_ATTACK_POWER;
        }
        return damage;
    }

    /** Heal per tick a group can deal. */
    public static groupHeal(creeps: Creep[]): number {
        let heal = 0;
        for (const creep of creeps) {
            heal += creep.getActiveBodyparts(HEAL) * HEAL_POWER;
        }
        return heal;
    }

    /** Overall fighting strength of a group: what it can kill plus what it can keep alive. */
    public static groupPower(creeps: Creep[]): number {
        return CombatIntel.groupDamage(creeps) + CombatIntel.groupHeal(creeps);
    }

    /**
     * Scores a hostile as an attack target from `from`.
     *
     * The score rewards killing things that hurt (and things that heal), and charges
     * for the fight we would have to walk through to get there, so a creep does not
     * shove past a boosted attacker to poke the weakest hostile on the field.
     */
    public static scoreTarget(from: RoomPosition, hostile: Creep, opts: TargetScoreOptions = {}): number {
        const hostiles = opts.hostiles ?? [];
        const engageRange = opts.engageRange ?? 1;

        let score = CombatIntel.threatValue(hostile);

        if (hostile.getActiveBodyparts(HEAL) > 0) {
            score += CombatIntel.HEALER_PRIORITY;
        }

        if (hostile.hitsMax > 0) {
            score += (1 - hostile.hits / hostile.hitsMax) * CombatIntel.FINISH_PRIORITY;
        }

        // Standing next to this hostile also puts us in reach of the hostiles around it.
        const crossfire = CombatIntel.incomingDamageAt(hostile.pos, hostiles, hostile);
        score -= crossfire * CombatIntel.CROSSFIRE_WEIGHT;

        // Anything we cannot out-damage is a trap: we would tank the whole group for nothing.
        if (opts.squadDamage && opts.squadDamage > 0) {
            const support = ThreatAssessment.effectiveHealFor(hostile, hostiles);
            if (support >= opts.squadDamage) {
                score -= CombatIntel.UNKILLABLE_PENALTY;
            }
        }

        const range = from.getRangeTo(hostile.pos);
        score -= Math.max(0, range - engageRange) * CombatIntel.TRAVEL_WEIGHT;

        return score;
    }

    /** Picks the best hostile to attack from `from`, or null when there are none. */
    public static selectTarget(from: RoomPosition, hostiles: Creep[], opts: TargetScoreOptions = {}): Creep | null {
        let best: Creep | null = null;
        let bestScore = -Infinity;
        const scoring: TargetScoreOptions = { ...opts, hostiles: opts.hostiles ?? hostiles };

        for (const hostile of hostiles) {
            const score = CombatIntel.scoreTarget(from, hostile, scoring);
            if (score > bestScore) {
                bestScore = score;
                best = hostile;
            }
        }

        return best;
    }

    /**
     * The most dangerous hostile already within `range` of the creep. Used so a fighter
     * hits whatever is in its face instead of walking past it toward a nicer target.
     */
    public static mostDangerousInRange(creep: Creep, hostiles: Creep[], range: number): Creep | null {
        let best: Creep | null = null;
        let bestValue = -Infinity;
        for (const hostile of hostiles) {
            if (creep.pos.getRangeTo(hostile.pos) > range) continue;
            const value = CombatIntel.threatValue(hostile);
            if (value > bestValue) {
                bestValue = value;
                best = hostile;
            }
        }
        return best;
    }

    /** True when a ranged mass attack beats focusing the target, given who is nearby. */
    public static shouldMassAttack(creep: Creep, hostiles: Creep[]): boolean {
        let massDamage = 0;
        for (const hostile of hostiles) {
            const range = creep.pos.getRangeTo(hostile.pos);
            if (range > 3) continue;
            massDamage += RANGED_ATTACK_POWER * (range <= 1 ? 1 : range === 2 ? 0.4 : 0.1);
        }
        return massDamage > RANGED_ATTACK_POWER;
    }

    /**
     * Best tile within one step that minimizes incoming damage.
     *
     * Optionally keeps `anchor` (a patient, or the focus target) within `anchorRange`
     * so a creep repositions without abandoning its job. Returns null when standing
     * still is already the best option or when the room cannot be inspected.
     */
    public static findSafeStep(
        creep: Creep,
        hostiles: Creep[],
        opts: { anchor?: RoomPosition; anchorRange?: number; minHostileRange?: number } = {},
    ): RoomPosition | null {
        const room = creep.room;
        if (typeof room.getTerrain !== "function" || typeof room.lookForAt !== "function") return null;

        const terrain = room.getTerrain();
        const anchorRange = opts.anchorRange ?? Infinity;
        const minHostileRange = opts.minHostileRange ?? 0;

        const scorePos = (pos: RoomPosition, onRampart: boolean): number => {
            // Ramparts are free safety: nothing outside can hit a creep standing on one.
            let score = onRampart ? 10000 : 0;
            score -= CombatIntel.incomingDamageAt(pos, hostiles);
            let closest = Infinity;
            for (const hostile of hostiles) {
                closest = Math.min(closest, pos.getRangeTo(hostile.pos));
            }
            if (closest !== Infinity) {
                // Prefer more space, but only up to the distance we actually want to keep.
                score += Math.min(closest, minHostileRange + 3) * 5;
            }
            return score;
        };

        let best: RoomPosition | null = null;
        let bestScore = scorePos(creep.pos, CombatIntel.hasMyRampart(room, creep.pos.x, creep.pos.y));

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const x = creep.pos.x + dx;
                const y = creep.pos.y + dy;
                if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                if (room.lookForAt(LOOK_CREEPS, x, y).length > 0) continue;

                const structures = room.lookForAt(LOOK_STRUCTURES, x, y);
                const blocked = structures.some(
                    s =>
                        s.structureType !== STRUCTURE_RAMPART &&
                        s.structureType !== STRUCTURE_ROAD &&
                        s.structureType !== STRUCTURE_CONTAINER,
                );
                if (blocked) continue;

                const pos = new RoomPosition(x, y, room.name);
                if (opts.anchor && pos.getRangeTo(opts.anchor) > anchorRange) continue;

                const onRampart = structures.some(
                    s => s.structureType === STRUCTURE_RAMPART && (s as StructureRampart).my,
                );
                const score = scorePos(pos, onRampart);
                if (score > bestScore) {
                    bestScore = score;
                    best = pos;
                }
            }
        }

        return best;
    }

    private static hasMyRampart(room: Room, x: number, y: number): boolean {
        return room
            .lookForAt(LOOK_STRUCTURES, x, y)
            .some(s => s.structureType === STRUCTURE_RAMPART && (s as StructureRampart).my);
    }
}
