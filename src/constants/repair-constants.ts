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
