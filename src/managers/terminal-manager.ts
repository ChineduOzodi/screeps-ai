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

        this.sellSurplusMinerals(terminal);
    }

    private sellSurplusMinerals(terminal: StructureTerminal): void {
        for (const resourceType in terminal.store) {
            if (resourceType === RESOURCE_ENERGY) continue;

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
