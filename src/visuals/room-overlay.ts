/**
 * Draws what the AI thinks about rooms that are not colony rooms.
 *
 * Two surfaces:
 * - In-room panel (RoomVisual) for any non-colony room we have vision of.
 * - Map overlay (Game.map.visual) for every room a colony remembers, vision or not,
 *   so the world map shows threat and intent at a glance. Map visuals cost nothing
 *   beyond serialising the shapes.
 */
import { RoomIntel, describeRoom, findTrackingColony } from "./room-intel";

export class RoomOverlay {
    /** Whether a room is the main room of one of our colonies. Those have their own stats panel. */
    public static isColonyRoom(roomName: string): boolean {
        return !!Memory.colonies?.[roomName];
    }

    private static myUsername(): string | undefined {
        for (const name in Game.spawns) {
            return Game.spawns[name].owner?.username;
        }
        return undefined;
    }

    /** In-room panel: what the AI sees and intends for a room it can see right now. */
    public static drawRoom(room: Room): void {
        if (!room.visual || RoomOverlay.isColonyRoom(room.name)) return;
        const colony = findTrackingColony(room.name);
        if (!colony) return;

        const intel = describeRoom(colony, room.name, room, RoomOverlay.myUsername());
        RoomOverlay.drawPanel(room.visual, intel);
    }

    private static drawPanel(visual: RoomVisual, intel: RoomIntel): void {
        const x = 1;
        let y = 2;
        const width = 20;
        const height = intel.lines.length * 0.9 + 2.4;

        visual.rect(x - 0.5, y - 1.2, width, height, { fill: "#000000", opacity: 0.45, stroke: intel.color });
        visual.text(`${intel.roomName}  ${intel.headline}`, x, y, { color: intel.color, font: 0.8, align: "left" });
        y += 1.1;
        visual.text(`tracked by ${intel.colonyId}`, x, y, { color: "#aaaaaa", font: 0.5, align: "left" });
        y += 0.9;
        for (const line of intel.lines) {
            visual.text(line, x, y, { color: "#dddddd", font: 0.5, align: "left" });
            y += 0.9;
        }
    }

    /** Map overlay for every remembered non-colony room. */
    public static drawMap(): void {
        const map = Game.map?.visual;
        if (!map) return;

        const drawn = new Set<string>();
        const myUsername = RoomOverlay.myUsername();
        for (const id in Memory.colonies) {
            const colony = Memory.colonies[id];
            // Legacy colonies keep rooms as an array until their first run migrates it.
            if (!colony || !colony.rooms || Array.isArray(colony.rooms)) continue;
            for (const roomName in colony.rooms) {
                if (drawn.has(roomName) || RoomOverlay.isColonyRoom(roomName)) continue;
                const tracking = findTrackingColony(roomName) ?? colony;
                const intel = describeRoom(tracking, roomName, Game.rooms[roomName], myUsername);
                RoomOverlay.drawMapRoom(map, intel, !!Game.rooms[roomName]);
                drawn.add(roomName);
            }
        }
    }

    private static drawMapRoom(map: MapVisual, intel: RoomIntel, hasVision: boolean): void {
        map.rect(new RoomPosition(0, 0, intel.roomName), 50, 50, {
            fill: intel.color,
            opacity: intel.alertLevel > 0 ? 0.25 : 0.08,
            stroke: intel.color,
            strokeWidth: hasVision ? 1.5 : 0.5,
        });
        map.text(`${intel.alertLevel > 0 ? "!" : ""}${intel.headline}`, new RoomPosition(25, 20, intel.roomName), {
            color: intel.color,
            fontSize: 7,
            backgroundColor: "#000000",
            backgroundPadding: 1,
            opacity: 0.9,
        });
        map.text(intel.alertLabel, new RoomPosition(25, 31, intel.roomName), {
            color: "#ffffff",
            fontSize: 5,
            opacity: 0.8,
        });
    }
}
