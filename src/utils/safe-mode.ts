import { CombatIntel } from "./combat-intel";
import { Logger } from "./logger";
import { ThreatAssessment, ThreatReport } from "./threat-assessment";

export interface SafeModeInput {
    /** Damage per tick the attackers can put out. Harmless scouts do not justify safe mode. */
    hostileAttackPower: number;
    hostileCount: number;
    /** Hostiles that have reached the base core (spawn/storage area). */
    hostilesInCore: number;
    /** One of spawn/tower/storage/terminal is already taking damage. */
    criticalStructureDamaged: boolean;
    /** False once every spawn in the room is gone. */
    hasSpawn: boolean;
    /** Damage per tick we can answer with: defenders plus towers that still have energy. */
    defensePower: number;
    /** A hostile with CLAIM parts is next to our controller. */
    controllerThreatened: boolean;
    /** Our creeps that are hurt or standing inside enemy weapon reach right now. */
    myCreepsUnderAttack: number;
    /** Every attacker is an NPC, which leaves on its own once its timer runs out. */
    npcOnly: boolean;
}

/**
 * Decides when to burn a safe mode activation.
 *
 * Safe mode is the last thing standing between a lost fight and a lost room, and it is
 * worthless once the spawn is down. The trigger therefore fires while we still have
 * something to protect, which covers attackers that never touch a building: a raider
 * that only hunts creeps still ends the colony once the last worker is dead.
 */
export class SafeModeGuard {
    /** How far from the core counts as "they are in the base". */
    public static readonly CORE_RANGE = 8;
    /** We hold off while our defense is at least this multiple of the attackers' power. */
    public static readonly DEFENSE_MARGIN = 1;
    /** Creeps that have to be under attack before a player raid counts as a massacre. */
    public static readonly MASSACRE_THRESHOLD = 2;
    /** Same, for NPCs: they leave on their own, so it takes a sustained wipe to be worth a charge. */
    public static readonly NPC_MASSACRE_THRESHOLD = 3;
    /** NPC owners. Their creeps expire on their own, so they rarely justify a charge. */
    public static readonly NPC_OWNERS = ["Invader", "Source Keeper"];

    public static shouldActivate(input: SafeModeInput): boolean {
        if (input.hostileCount === 0) return false;

        // A hostile that cannot shoot, dismantle or claim is not worth a safe mode.
        if (input.hostileAttackPower <= 0 && !input.controllerThreatened) return false;

        // No spawn left means no way to rebuild a defense: buy the time now.
        if (!input.hasSpawn) return true;

        // They are chewing on the controller; losing it loses the room outright.
        if (input.controllerThreatened) return true;

        const losing = input.defensePower < input.hostileAttackPower * SafeModeGuard.DEFENSE_MARGIN;

        // Buildings are already being destroyed and we are not winning the fight.
        if (input.criticalStructureDamaged && losing) return true;

        // They are hunting our creeps and we cannot out-damage them. Attackers that never
        // touch a structure still take the room: once the workers are gone there is no
        // energy, no defenders, and nothing left to stop them with.
        //
        // Losing a single creep is a raid we would rather absorb than answer with a charge
        // we cannot replace for 50,000 ticks, so it takes a second body before we call it.
        // NPCs expire on their own, so they need a third.
        const massacreThreshold = input.npcOnly
            ? SafeModeGuard.NPC_MASSACRE_THRESHOLD
            : SafeModeGuard.MASSACRE_THRESHOLD;
        if (losing && input.myCreepsUnderAttack >= massacreThreshold) return true;

        // They are inside the base and we cannot stop them; waiting only costs us creeps.
        return input.hostilesInCore > 0 && losing;
    }

    /** Evaluates the room and activates safe mode when it is the right call. */
    public static run(room: Room, threat: ThreatReport, towers: StructureTower[]): boolean {
        const controller = room.controller;
        if (!controller || !controller.my) return false;
        if (controller.safeMode || !controller.safeModeAvailable || controller.safeModeCooldown) return false;

        const input = SafeModeGuard.gather(room, threat, towers);
        if (!SafeModeGuard.shouldActivate(input)) return false;

        const result = controller.activateSafeMode();
        if (result === OK) {
            Logger.warning(
                `[SafeMode] activated in ${room.name}: ${input.hostileCount} hostiles ` +
                    `(${input.hostileAttackPower} dmg/tick) vs ${input.defensePower} defense`,
            );
            return true;
        }

        Logger.error(`[SafeMode] activation in ${room.name} failed with ${result}`);
        return false;
    }

    private static gather(room: Room, threat: ThreatReport, towers: StructureTower[]): SafeModeInput {
        const spawns = room.find(FIND_MY_SPAWNS);
        const core = spawns[0]?.pos ?? room.storage?.pos ?? room.controller?.pos;

        const hostilesInCore = core
            ? threat.hostiles.filter(h => core.getRangeTo(h.pos) <= SafeModeGuard.CORE_RANGE).length
            : 0;

        const criticalStructureDamaged = room
            .find(FIND_MY_STRUCTURES, {
                filter: s =>
                    s.hits < s.hitsMax &&
                    (s.structureType === STRUCTURE_SPAWN ||
                        s.structureType === STRUCTURE_TOWER ||
                        s.structureType === STRUCTURE_STORAGE ||
                        s.structureType === STRUCTURE_TERMINAL),
            })
            .some(() => true);

        const defenders = room.find(FIND_MY_CREEPS, {
            filter: c => c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0,
        });
        const activeTowers = towers.filter(t => t.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST);
        const towerDamage =
            threat.hostiles.length > 0 ? ThreatAssessment.totalTowerDamage(activeTowers, threat.hostiles[0].pos) : 0;

        const controllerThreatened = room.controller
            ? threat.hostiles.some(h => h.getActiveBodyparts(CLAIM) > 0 && h.pos.getRangeTo(room.controller!.pos) <= 3)
            : false;

        // Anything hurt, or standing where a hostile can reach it, is about to be a corpse.
        const myCreepsUnderAttack = room
            .find(FIND_MY_CREEPS)
            .filter(c => c.hits < c.hitsMax || CombatIntel.incomingDamageAt(c.pos, threat.hostiles) > 0).length;

        return {
            hostileAttackPower: threat.attackPower,
            hostileCount: threat.totalHostiles,
            hostilesInCore,
            criticalStructureDamaged,
            hasSpawn: spawns.length > 0,
            defensePower: CombatIntel.groupDamage(defenders) + towerDamage,
            controllerThreatened,
            myCreepsUnderAttack,
            npcOnly: threat.hostiles.every(h => SafeModeGuard.NPC_OWNERS.includes(h.owner?.username)),
        };
    }
}
