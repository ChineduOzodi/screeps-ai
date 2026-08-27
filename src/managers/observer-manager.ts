import { ColonyManager } from "../prototypes/types";
import { RoomUtils } from "../utils/room-utils";

/**
 * Uses the RCL 8 observer to keep intel fresh without scout creeps:
 * each tick it ingests the room observed last tick, then requests the
 * next stalest room in range.
 */
export class ObserverManager {
    private colony: ColonyManager;

    constructor(colony: ColonyManager) {
        this.colony = colony;
    }

    public run(): void {
        const room = this.colony.getMainRoom();
        if (!room || !room.controller || (room.controller.level || 0) < 8) return;
        if (typeof room.find !== "function") return;

        const observer = room.find<StructureObserver>(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_OBSERVER,
        })[0];
        if (!observer) return;

        if (!this.colony.colonyInfo.observerManagement) {
            this.colony.colonyInfo.observerManagement = {};
        }
        const info = this.colony.colonyInfo.observerManagement;

        // Vision from observeRoom only lasts the following tick — ingest it now.
        if (info.pendingRoom) {
            const observed = Game.rooms[info.pendingRoom];
            if (observed) {
                RoomUtils.updateRoomData(this.colony, observed);
            }
            delete info.pendingRoom;
        }

        const target = ObserverManager.pickObserveTarget(this.colony, room.name);
        if (target && observer.observeRoom(target) === OK) {
            info.pendingRoom = target;
        }
    }

    /** The stalest room needing a scout that the observer can actually reach. */
    public static pickObserveTarget(colony: ColonyManager, fromRoom: string): string | undefined {
        const candidates = RoomUtils.getRoomsNeedingScout(colony).filter(
            roomName => roomName !== fromRoom && Game.map.getRoomLinearDistance(fromRoom, roomName) <= OBSERVER_RANGE,
        );
        if (candidates.length === 0) return undefined;

        return candidates.sort((a, b) => {
            const dataA = colony.colonyInfo.rooms[a];
            const dataB = colony.colonyInfo.rooms[b];
            return (dataA?.lastScouted || 0) - (dataB?.lastScouted || 0);
        })[0];
    }
}
