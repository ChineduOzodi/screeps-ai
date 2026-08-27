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
/** Amount of a reagent bought per market deal. */
const REAGENT_BUY_AMOUNT = 1000;
/** Stop buying once we hold this much of the reagent. */
const REAGENT_BUY_TARGET = 2000;
/** Credits kept in reserve — never spend below this. */
const CREDIT_RESERVE = 1000;
/** Without price history, refuse to pay more than this per unit. */
const FALLBACK_MAX_PRICE = 10;
/** Pay at most this multiple of the recent average price. */
const MAX_PRICE_MULTIPLIER = 1.5;

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

        // One terminal action per cooldown window, in priority order:
        // support a sister colony > unblock the lab pipeline > sell surplus.
        if (this.sendEnergySupport(terminal)) return;
        if (this.buyMissingReagents(terminal)) return;

        this.sellSurplusMinerals(terminal);
    }

    /** Buys raw minerals the LabManager needs but the colony can't mine locally. */
    private buyMissingReagents(terminal: StructureTerminal): boolean {
        const requests = this.colony.colonyInfo.labManagement?.buyRequests;
        if (!requests || requests.length === 0) return false;

        for (const resource of requests) {
            const room = terminal.room;
            const onHand = (terminal.store[resource] || 0) + (room.storage?.store[resource] || 0);
            if (onHand >= REAGENT_BUY_TARGET) continue;

            const maxPrice = this.getMaxBuyPrice(resource);
            const orders = Game.market
                .getAllOrders({ type: ORDER_SELL, resourceType: resource })
                .filter(o => o.amount > 0 && o.roomName && o.price <= maxPrice)
                .sort((a, b) => a.price - b.price);

            for (const order of orders) {
                const amount = Math.min(REAGENT_BUY_AMOUNT, order.amount, REAGENT_BUY_TARGET - onHand);
                const creditCost = amount * order.price;
                if (Game.market.credits - creditCost < CREDIT_RESERVE) break;

                const energyCost = Game.market.calcTransactionCost(amount, room.name, order.roomName as string);
                if (energyCost > terminal.store[RESOURCE_ENERGY]) continue;

                const result = Game.market.deal(order.id, amount, room.name);
                if (result === OK) {
                    Logger.info(
                        `[Terminal] ${room.name} bought ${amount} ${resource} at ${order.price} cr for the labs`,
                    );
                    return true;
                }
            }
        }
        return false;
    }

    private getMaxBuyPrice(resource: ResourceConstant): number {
        const history = Game.market.getHistory(resource);
        if (!history || history.length === 0) return FALLBACK_MAX_PRICE;

        const recent = history[history.length - 1];
        if (!recent || !recent.avgPrice) return FALLBACK_MAX_PRICE;

        return recent.avgPrice * MAX_PRICE_MULTIPLIER;
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
        const labInfo = this.colony.colonyInfo.labManagement;
        const labNeeds = new Set<string>([...(labInfo?.reagents || []), ...(labInfo?.buyRequests || [])]);

        for (const resourceType in terminal.store) {
            if (resourceType === RESOURCE_ENERGY) continue;
            // Only sell raw minerals (single-letter resources); compounds are kept for boosting.
            if (resourceType.length > 1) continue;
            // Don't sell what the lab pipeline is consuming or trying to acquire.
            if (labNeeds.has(resourceType)) continue;

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
