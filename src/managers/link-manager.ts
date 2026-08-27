import { ColonyManager } from "../prototypes/types";

/**
 * Moves energy through the room's link network each tick:
 * source links -> controller link (to feed upgraders) -> core link (next to storage/spawn).
 * Without this, links get built but never transfer anything.
 */
export class LinkManager {
    private colony: ColonyManager;

    constructor(colony: ColonyManager) {
        this.colony = colony;
    }

    public run(): void {
        const room = this.colony.getMainRoom();
        if (!room || !room.controller || typeof room.find !== "function") return;

        const links = room.find<StructureLink>(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_LINK,
        });
        if (links.length < 2) return;

        const { sourceLinks, controllerLink, coreLink } = LinkManager.classifyLinks(room, links);

        for (const link of sourceLinks) {
            if (link.cooldown > 0 || link.store[RESOURCE_ENERGY] < 400) continue;

            const target = LinkManager.pickReceiver(controllerLink, coreLink);
            if (target) {
                link.transferEnergy(target);
            }
        }

        // Top up the controller link from the core link so upgraders always have energy nearby.
        if (
            coreLink &&
            controllerLink &&
            coreLink.cooldown === 0 &&
            coreLink.store[RESOURCE_ENERGY] >= 400 &&
            controllerLink.store[RESOURCE_ENERGY] < 400
        ) {
            coreLink.transferEnergy(controllerLink);
        }
    }

    public static classifyLinks(
        room: Room,
        links: StructureLink[],
    ): { sourceLinks: StructureLink[]; controllerLink?: StructureLink; coreLink?: StructureLink } {
        const sources = room.find(FIND_SOURCES);
        const sourceLinks: StructureLink[] = [];
        let controllerLink: StructureLink | undefined;
        let coreLink: StructureLink | undefined;

        for (const link of links) {
            if (sources.some(s => link.pos.inRangeTo(s.pos, 2))) {
                sourceLinks.push(link);
            } else if (room.controller && link.pos.inRangeTo(room.controller.pos, 3)) {
                controllerLink = link;
            } else {
                // Anything else (near storage/spawn) acts as the core receiver.
                coreLink = link;
            }
        }

        return { sourceLinks, controllerLink, coreLink };
    }

    private static pickReceiver(controllerLink?: StructureLink, coreLink?: StructureLink): StructureLink | undefined {
        // Feed the controller link first — upgrader throughput is the main win from links.
        if (controllerLink && controllerLink.store.getFreeCapacity(RESOURCE_ENERGY) >= 400) {
            return controllerLink;
        }
        if (coreLink && coreLink.store.getFreeCapacity(RESOURCE_ENERGY) >= 400) {
            return coreLink;
        }
        return undefined;
    }
}
