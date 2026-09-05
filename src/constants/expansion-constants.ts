/** Minimum RCL before a colony considers founding a new one. */
export const MIN_EXPANSION_RCL = 4;
/** Don't expand into rooms further than this (approximate travel ticks). */
export const MAX_EXPANSION_DISTANCE = 200;
/**
 * Energy banked above the reserve before a colony founds another. Covers the claimer,
 * the pioneers and the first spawn without dipping into the reserve the towers need.
 */
export const EXPANSION_MIN_SURPLUS = 30000;
