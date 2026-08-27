export interface ThreatReport {
    totalHostiles: number;
    hostiles: Creep[];
    attackPower: number;
    healPower: number;
    maxIndividualHits: number;
    weakestHostile: Creep | null;
    isSpawnUnderAttack: boolean;
}

export class ThreatAssessment {
    public static assess(room: Room): ThreatReport {
        const hostiles = room.find(FIND_HOSTILE_CREEPS);
        const spawn = room.find(FIND_MY_SPAWNS)[0];

        let attackPower = 0;
        let healPower = 0;
        let maxIndividualHits = 0;
        let weakestHostile: Creep | null = null;
        let minHits = Infinity;

        for (const hostile of hostiles) {
            attackPower += this.calculateAttackPower(hostile);
            healPower += this.calculateHealPower(hostile);
            maxIndividualHits = Math.max(maxIndividualHits, hostile.hits);

            if (hostile.hits < minHits) {
                minHits = hostile.hits;
                weakestHostile = hostile;
            }
        }

        const isSpawnUnderAttack = spawn
            ? hostiles.some(h => h.pos.isNearTo(spawn)) && spawn.hits < spawn.hitsMax
            : false;

        return {
            totalHostiles: hostiles.length,
            hostiles,
            attackPower,
            healPower,
            maxIndividualHits,
            weakestHostile,
            isSpawnUnderAttack,
        };
    }

    public static calculateAttackPower(creep: Creep): number {
        return (
            creep.getActiveBodyparts(ATTACK) * ATTACK_POWER +
            creep.getActiveBodyparts(RANGED_ATTACK) * RANGED_ATTACK_POWER
        );
    }

    public static calculateHealPower(creep: Creep): number {
        return creep.getActiveBodyparts(HEAL) * HEAL_POWER;
    }

    /** Damage a single tower deals to a target at the given range, accounting for falloff. */
    public static towerDamageAtRange(range: number): number {
        if (range <= TOWER_OPTIMAL_RANGE) {
            return TOWER_POWER_ATTACK;
        }
        const falloffRange = Math.min(range, TOWER_FALLOFF_RANGE);
        const falloffFraction = (falloffRange - TOWER_OPTIMAL_RANGE) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE);
        return Math.floor(TOWER_POWER_ATTACK * (1 - TOWER_FALLOFF * falloffFraction));
    }

    /** Total damage per tick the given towers can deal to a position. Only counts towers with enough energy to fire. */
    public static totalTowerDamage(towers: StructureTower[], pos: RoomPosition): number {
        let damage = 0;
        for (const tower of towers) {
            if (tower.store[RESOURCE_ENERGY] < TOWER_ENERGY_COST) continue;
            damage += this.towerDamageAtRange(tower.pos.getRangeTo(pos));
        }
        return damage;
    }

    /** Heal per tick that can plausibly reach the target: its own heal plus heal from hostiles within range 3. */
    public static effectiveHealFor(target: Creep, hostiles: Creep[]): number {
        let heal = 0;
        for (const hostile of hostiles) {
            if (hostile.id === target.id || hostile.pos.inRangeTo(target, 3)) {
                heal += this.calculateHealPower(hostile);
            }
        }
        return heal;
    }

    /**
     * Picks the best focus-fire target for the room's towers.
     * Prefers targets the towers can actually out-damage (net damage > 0),
     * prioritizing healers, then lowest hits. Returns null when every hostile
     * out-heals our damage — firing would only drain energy.
     */
    public static selectTowerTarget(towers: StructureTower[], report: ThreatReport): Creep | null {
        const activeTowers = towers.filter(t => t.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST);
        if (activeTowers.length === 0 || report.hostiles.length === 0) {
            return null;
        }

        let best: Creep | null = null;
        let bestScore = -Infinity;

        for (const hostile of report.hostiles) {
            const damage = this.totalTowerDamage(activeTowers, hostile.pos);
            const heal = this.effectiveHealFor(hostile, report.hostiles);
            const netDamage = damage - heal;
            if (netDamage <= 0) continue;

            // Score: net damage, with a strong bonus for healers (removing heal support
            // makes everything else killable) and a bonus for nearly-dead targets.
            let score = netDamage;
            if (hostile.getActiveBodyparts(HEAL) > 0) {
                score += 1000;
            }
            score += (1 - hostile.hits / hostile.hitsMax) * 500;

            if (score > bestScore) {
                bestScore = score;
                best = hostile;
            }
        }

        return best;
    }
}
