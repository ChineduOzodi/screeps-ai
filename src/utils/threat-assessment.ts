export interface ThreatReport {
    totalHostiles: number;
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
            attackPower,
            healPower,
            maxIndividualHits,
            weakestHostile,
            isSpawnUnderAttack,
        };
    }

    private static calculateAttackPower(creep: Creep): number {
        return (
            creep.getActiveBodyparts(ATTACK) * ATTACK_POWER +
            creep.getActiveBodyparts(RANGED_ATTACK) * RANGED_ATTACK_POWER
        );
    }

    private static calculateHealPower(creep: Creep): number {
        return creep.getActiveBodyparts(HEAL) * HEAL_POWER;
    }
}
