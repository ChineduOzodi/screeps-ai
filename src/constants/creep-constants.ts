export class CreepConstants {
    public static ATTACK_PART_COST = 80;
    public static RANGED_ATTACK_PART_COST = 150;
    public static MOVE_PART_COST = 50;
    public static WORK_PART_COST = 100;
    public static TOUGH_PART_COST = 10;
    public static CARRY_PART_COST = 50;
    public static CLAIM_PART_COST = 600;
    public static HEAL_PART_COST = 250;
    public static CARRY_PART_RESOURCE_AMOUNT = 50;
    public static WORK_PART_ENERGY_HARVEST_PER_TICK = 2;
    public static WORK_PART_ENERGY_BUILD_PER_TICK = 5;
}

export const BODYPART_COST_MAP = {
    move: CreepConstants.MOVE_PART_COST,
    work: CreepConstants.WORK_PART_COST,
    carry: CreepConstants.CARRY_PART_COST,
    attack: CreepConstants.ATTACK_PART_COST,
    // eslint-disable-next-line camelcase
    ranged_attack: CreepConstants.RANGED_ATTACK_PART_COST,
    heal: CreepConstants.HEAL_PART_COST,
    claim: CreepConstants.CLAIM_PART_COST,
    tough: CreepConstants.TOUGH_PART_COST,
};
