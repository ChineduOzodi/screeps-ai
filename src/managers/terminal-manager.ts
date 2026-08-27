import { ColonyManager } from "../prototypes/types";
import { Logger } from "../utils/logger";

/** Energy the terminal keeps on hand to pay market transaction fees. */
export const TERMINAL_ENERGY_RESERVE = 10000;
/** Start selling a mineral once the terminal holds more than this. */
export const MINERAL_SELL_THRESHOLD = 3000;
/** Keep this much of each mineral for future lab use. */
export const MINERAL_KEEP_AMOUNT = 1000;
/** Max amount to sell in one deal. */
const MAX_DEAL_AMOUNT = 5000;
/** Energy sent per support shipment to a struggling colony. */
const ENERGY_SUPPORT_AMOUNT = 10000;
/** Only send support when our own stored-energy ratio is above this. */
const ENERGY_SUPPORT_MIN_OWN_PERCENT = 0.7;
/** Colonies below this stored-energy ratio receive support. */
const ENERGY_SUPPORT_NEEDY_PERCENT = 0.3;

/**
 * Turns surplus minerals into credits via the market. Runs infrequently —
 * market order scans are CPU-heavy.
 */
export class TerminalManager {
    private colony: ColonyManager;

    constructor(colony: ColonyManager) {
        this.colony = colony;
    }

    public run(): void {
        if (Game.time % 100 !== 0) return;

        const room = this.colony.getMainRoom();
        const terminal = room?.terminal;
        if (!terminal || !terminal.isActive() || terminal.cooldown > 0) return;

        // Helping a sister colony beats selling — one action per cooldown window.
        if (this.sendEnergySupport(terminal)) return;

        this.sellSurplusMinerals(terminal);
    }

    /** Ships energy to another of our colonies whose storage is running dry. */
    private sendEnergySupport(terminal: StructureTerminal): boolean {
        const ownPercent = this.colony.colonyInfo.energyManagement?.storedEnergyPercent || 0;
        if (ownPercent < ENERGY_SUPPORT_MIN_OWN_PERCENT) return false;
        if (terminal.store[RESOURCE_ENERGY] < ENERGY_SUPPORT_AMOUNT + TERMINAL_ENERGY_RESERVE) return false;

        for (const colonyId in Memory.colonies) {
            if (colonyId === this.colony.colonyInfo.id) continue;

            const other = Memory.colonies[colonyId];
            if (!other) continue;

            const otherRoom = Game.rooms[colonyId];
            if (!otherRoom?.terminal || otherRoom.terminal.store.getFreeCapacity() < ENERGY_SUPPORT_AMOUNT) continue;

            const otherPercent = other.energyManagement?.storedEnergyPercent;
            if (typeof otherPercent !== "number" || otherPercent >= ENERGY_SUPPORT_NEEDY_PERCENT) continue;

            const result = terminal.send(RESOURCE_ENERGY, ENERGY_SUPPORT_AMOUNT, colonyId);
            if (result === OK) {
                Logger.info(
                    `[Terminal] ${terminal.room.name} sent ${ENERGY_SUPPORT_AMOUNT} energy to struggling colony ${colonyId}`,
                );
                return true;
            }
        }
        return false;
    }

    private sellSurplusMinerals(terminal: StructureTerminal): void {
        for (const resourceType in terminal.store) {
            if (resourceType === RESOURCE_ENERGY) continue;
            // Only sell raw minerals (single-letter resources); compounds are kept for boosting.
            if (resourceType.length > 1) continue;

            const amount = terminal.store[resourceType as ResourceConstant];
            if (amount <= MINERAL_SELL_THRESHOLD) continue;

            const sellAmount = Math.min(amount - MINERAL_KEEP_AMOUNT, MAX_DEAL_AMOUNT);
            if (this.sellToBestOrder(terminal, resourceType as ResourceConstant, sellAmount)) {
                return; // One deal per terminal cooldown window
            }
        }
    }

    private sellToBestOrder(terminal: StructureTerminal, resourceType: ResourceConstant, amount: number): boolean {
        const orders = Game.market
            .getAllOrders({ type: ORDER_BUY, resourceType })
            .filter(o => o.amount > 0 && o.roomName)
            .sort((a, b) => b.price - a.price);

        for (const order of orders) {
            const dealAmount = Math.min(amount, order.amount);
            const energyCost = Game.market.calcTransactionCost(
                dealAmount,
                terminal.room.name,
                order.roomName as string,
            );

            if (energyCost > terminal.store[RESOURCE_ENERGY]) continue;

            const result = Game.market.deal(order.id, dealAmount, terminal.room.name);
            if (result === OK) {
                Logger.info(
                    `[Terminal] ${terminal.room.name} sold ${dealAmount} ${resourceType} at ${order.price} cr (fee: ${energyCost} energy)`,
                );
                return true;
            }
        }

        return false;
    }
}
