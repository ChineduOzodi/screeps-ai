export const WALL_TARGET_HPS: { [rcl: number]: number } = {
    1: 0,
    2: 1000,
    3: 10000,
    4: 50000,
    5: 100000,
    6: 300000,
    7: 1000000,
    8: 5000000,
};

export const RAMPART_TARGET_HPS: { [rcl: number]: number } = {
    1: 0,
    2: 1000,
    3: 5000,
    4: 10000,
    5: 50000,
    6: 150000,
    7: 500000,
    8: 3000000,
};

export const STORAGE_TARGETS: { [rcl: number]: number } = {
    1: 0,
    2: 0,
    3: 0, // No storage yet
    4: 20000, // Storage built at RCL 4
    5: 50000,
    6: 100000,
    7: 250000,
    8: 500000,
};

export const REPAIR_THRESHOLD_EMERGENCY = 0.2;
export const REPAIR_THRESHOLD_DECAY_PREVENTION = 1000;

/**
 * Hits a rampart is kept above outside of combat: towers top up any rampart below this and
 * builders top up a rampart they just finished. A new rampart has 1 hit and loses 300 every
 * 100 ticks, so without this it is destroyed long before the repairer gets to it.
 */
export const RAMPART_TOPUP_HITS = 5000;
/** Towers only spend energy on peace-time rampart upkeep while they keep this share for defense. */
export const TOWER_REPAIR_MIN_ENERGY_FRACTION = 0.5;
