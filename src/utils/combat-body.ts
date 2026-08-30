import { BODYPART_COST_MAP } from "constants/creep-constants";

/**
 * Relative part counts for one "unit" of a combat body. Bodies are grown by
 * repeating the unit, so the ratio also fixes the fatigue balance: keep `move`
 * close to `tough + action + heal` for full speed off-road.
 */
export interface CombatBodyRatio {
    tough: number;
    move: number;
    /** Business-end parts: ATTACK, RANGED_ATTACK or HEAL. */
    action: number;
    /** Self-sustain HEAL parts, appended at the very tail. Ignored when the action part is HEAL. */
    heal?: number;
}

export interface CombatBodyParts {
    tough: number;
    move: number;
    action: number;
    heal: number;
}

/**
 * Builds combat bodies laid out for survivability.
 *
 * Screeps removes body parts front-to-back as a creep takes damage, so part order
 * decides what a wounded creep can still do:
 * - TOUGH first, purely as armor for everything behind it.
 * - Most MOVE parts next, so damage eats cheap mobility before it eats weapons.
 * - Weapons in the tail, interleaved with the remaining MOVE parts so a heavily
 *   wounded creep keeps both damage output and enough mobility to reposition.
 * - HEAL last of all, so self-sustain is the very last thing the creep loses.
 */
export class CombatBody {
    /** Screeps hard limit on parts per creep. */
    public static readonly MAX_PARTS = 50;

    /** Share of MOVE parts kept in the tail (the rest lead, as damage padding). */
    private static readonly TAIL_MOVE_SHARE = 0.4;

    /** Melee defender: armored, self-sustaining, road-speed with a full load. */
    public static readonly MELEE_RATIO: CombatBodyRatio = { tough: 2, move: 5, action: 4, heal: 1 };

    /** Ranged defender: lighter armor, more MOVE so it can hold its kiting distance. */
    public static readonly RANGED_RATIO: CombatBodyRatio = { tough: 1, move: 4, action: 3, heal: 1 };

    /** Dedicated healer: no weapons, full speed so it can stay out of reach. */
    public static readonly HEALER_RATIO: CombatBodyRatio = { tough: 1, move: 3, action: 2 };

    /** Builds the biggest body of the given shape that `energy` and the part cap allow. */
    public static build(
        actionPart: BodyPartConstant,
        energy: number,
        ratio: CombatBodyRatio,
        maxParts: number = CombatBody.MAX_PARTS,
    ): BodyPartConstant[] {
        return CombatBody.layout(actionPart, CombatBody.compose(actionPart, energy, ratio, maxParts));
    }

    /** Part counts for the given budget, keeping the ratio and respecting the 50 part cap. */
    public static compose(
        actionPart: BodyPartConstant,
        energy: number,
        ratio: CombatBodyRatio,
        maxParts: number = CombatBody.MAX_PARTS,
    ): CombatBodyParts {
        const cap = Math.max(2, Math.min(maxParts, CombatBody.MAX_PARTS));
        const healPerUnit = actionPart === HEAL ? 0 : (ratio.heal ?? 0);
        const unitParts = ratio.tough + ratio.move + ratio.action + healPerUnit;
        const unitCost =
            ratio.tough * BODYPART_COST_MAP[TOUGH] +
            ratio.move * BODYPART_COST_MAP[MOVE] +
            ratio.action * CombatBody.partCost(actionPart) +
            healPerUnit * BODYPART_COST_MAP[HEAL];

        const pairCost = BODYPART_COST_MAP[MOVE] + CombatBody.partCost(actionPart);
        const units = Math.min(Math.floor(energy / unitCost), Math.floor(cap / unitParts));

        if (units < 1) {
            // Too poor for a full unit: fall back to plain MOVE/action pairs so we still
            // field something. Never returns an empty body — the spawn call would fail.
            const pairs = Math.max(1, Math.min(Math.floor(energy / pairCost), Math.floor(cap / 2)));
            return { tough: 0, move: pairs, action: pairs, heal: 0 };
        }

        const parts: CombatBodyParts = {
            tough: units * ratio.tough,
            move: units * ratio.move,
            action: units * ratio.action,
            heal: units * healPerUnit,
        };

        // Spend the remainder on MOVE/action pairs so a budget that does not divide
        // evenly into units is not thrown away. Pairs keep the fatigue balance.
        let spare = energy - units * unitCost;
        let count = units * unitParts;
        while (spare >= pairCost && count + 2 <= cap) {
            parts.move++;
            parts.action++;
            spare -= pairCost;
            count += 2;
        }

        return parts;
    }

    /** Orders the given part counts: TOUGH, lead MOVE, weapons interleaved with tail MOVE, HEAL. */
    public static layout(actionPart: BodyPartConstant, parts: CombatBodyParts): BodyPartConstant[] {
        const body: BodyPartConstant[] = [];

        for (let i = 0; i < parts.tough; i++) {
            body.push(TOUGH);
        }

        const tailMove =
            parts.action > 0
                ? Math.min(parts.move, Math.max(1, Math.round(parts.move * CombatBody.TAIL_MOVE_SHARE)))
                : 0;
        const leadMove = parts.move - tailMove;
        for (let i = 0; i < leadMove; i++) {
            body.push(MOVE);
        }

        // Spread the tail MOVE parts evenly through the weapons so mobility degrades
        // gradually instead of vanishing the moment the lead MOVE block is chewed off.
        const tailSlots = parts.action + tailMove;
        let placedMove = 0;
        for (let slot = 1; slot <= tailSlots; slot++) {
            const wantedMove = Math.round((slot * tailMove) / tailSlots);
            if (wantedMove > placedMove) {
                body.push(MOVE);
                placedMove++;
            } else {
                body.push(actionPart);
            }
        }

        for (let i = 0; i < parts.heal; i++) {
            body.push(HEAL);
        }

        return body;
    }

    public static partCost(part: BodyPartConstant): number {
        return BODYPART_COST_MAP[part as keyof typeof BODYPART_COST_MAP];
    }

    public static cost(body: BodyPartConstant[]): number {
        return body.reduce((sum, part) => sum + CombatBody.partCost(part), 0);
    }
}
