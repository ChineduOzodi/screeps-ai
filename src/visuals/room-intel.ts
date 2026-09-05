/**
 * Turns what the colonies remember about a room into a short, human-readable verdict:
 * how dangerous the AI thinks it is, what it plans to do there, and why it is (or is
 * not) doing more. Pure: everything comes from colony memory plus an optional live
 * room, so the overlay that draws it stays thin and this stays unit-testable.
 */
import { ThreatAssessment } from "../utils/threat-assessment";

/** Mirrors the defender spawners: alert 1 means harmless hostiles, 2+ means armed ones. */
export const ALERT_COLORS: { [level: number]: string } = {
    0: "#4caf50",
    1: "#ffeb3b",
    2: "#ff9800",
    3: "#f44336",
    4: "#d32f2f",
    5: "#b71c1c",
};

export type RoomPlan = "expanding" | "mining" | "candidate" | "scouting" | "avoiding" | "ignored";

export interface RoomIntel {
    roomName: string;
    /** Colony that tracks the room. */
    colonyId: string;
    alertLevel: number;
    alertLabel: string;
    color: string;
    plan: RoomPlan;
    /** One-line summary for the map. */
    headline: string;
    /** Detail lines for the in-room panel. Each explains one decision. */
    lines: string[];
}

/** Same cap the expansion system uses when picking a candidate. */
const MAX_EXPANSION_DISTANCE = 300;

export function alertLabel(level: number): string {
    if (level <= 0) return "clear";
    if (level === 1) return "watch: unarmed hostiles";
    if (level === 2) return "threat: armed hostiles";
    if (level === 3) return "danger: raid";
    return "critical: heavy raid";
}

export function alertColor(level: number): string {
    return ALERT_COLORS[Math.max(0, Math.min(5, Math.floor(level)))] ?? ALERT_COLORS[5];
}

/** The colony that knows about the room, preferring the one actually mining it. */
export function findTrackingColony(roomName: string): Colony | undefined {
    let fallback: Colony | undefined;
    for (const id in Memory.colonies) {
        const colony = Memory.colonies[id];
        if (!colony || !colony.rooms || Array.isArray(colony.rooms) || !colony.rooms[roomName]) continue;
        if (minedSourceCount(colony, roomName) > 0) return colony;
        fallback = fallback ?? colony;
    }
    return fallback;
}

function minedSourceCount(colony: Colony, roomName: string): number {
    const sources = colony.energyManagement?.sources ?? [];
    return sources.filter(s => s.position && s.position.roomName === roomName).length;
}

/** Rooms the energy system will mine: closest safe, scouted rooms up to floor(RCL/2). */
function remoteMiningRank(colony: Colony, roomName: string): { rank: number; cap: number } {
    const rooms = colony.rooms;
    const ranked = Object.keys(rooms)
        .filter(name => !rooms[name].isMain && rooms[name].alertLevel <= 1 && !!rooms[name].distance)
        .sort((a, b) => (rooms[a].distance || 0) - (rooms[b].distance || 0));
    return { rank: ranked.indexOf(roomName), cap: Math.floor((colony.level || 0) / 2) };
}

function describeExpansionEligibility(data: RoomData, myUsername?: string): string {
    if (Memory.colonies[data.name]) return "already a colony";
    if (data.owner) return `owned by ${data.owner}: no expansion`;
    if (data.reservation && data.reservation !== myUsername) return `reserved by ${data.reservation}: no expansion`;
    if (data.alertLevel > 0) return "expansion blocked by threat";
    if ((data.sourceCount || 0) < 2) return `expansion needs 2 sources, has ${data.sourceCount || 0}`;
    if (!data.distance) return "expansion: not scouted";
    if (data.distance > MAX_EXPANSION_DISTANCE) return `expansion: too far (${data.distance})`;
    return "expansion candidate";
}

function ageText(lastScouted: number | undefined): string {
    if (!lastScouted) return "never scouted";
    const age = Game.time - lastScouted;
    return age <= 1 ? "scouted now" : `scouted ${age}t ago`;
}

/**
 * Builds the verdict for one room. `room` is the live room when we have vision; it
 * adds what the AI sees this tick (hostiles, reservation timer) to what it remembers.
 */
export function describeRoom(colony: Colony, roomName: string, room?: Room, myUsername?: string): RoomIntel {
    const data: RoomData = colony.rooms[roomName] ?? { name: roomName, alertLevel: 0 };
    const lines: string[] = [];
    const alertLevel = data.alertLevel || 0;
    const color = alertColor(alertLevel);

    lines.push(`alert ${alertLevel}: ${alertLabel(alertLevel)}`);

    if (room && typeof room.find === "function") {
        const threat = ThreatAssessment.assess(room);
        if (threat.totalHostiles > 0) {
            lines.push(`${threat.totalHostiles} hostile(s): ${threat.attackPower} dmg/t, ${threat.healPower} heal/t`);
            const squad = Memory.squads?.[roomName];
            if (squad) lines.push(squad.engaged ? "squad: engaged" : "squad: holding at rally");
        }
    }

    // Who holds the room right now.
    const controller = room?.controller;
    if (controller?.owner && !controller.my) {
        lines.push(`owner: ${controller.owner.username}`);
    } else if (data.owner) {
        lines.push(`owner: ${data.owner}`);
    }
    const reservation = controller?.reservation;
    if (reservation) {
        const ours = reservation.username === myUsername;
        lines.push(`reserved by ${ours ? "us" : reservation.username} (${reservation.ticksToEnd}t)`);
        if (ours && reservation.ticksToEnd < 4000 && alertLevel <= 1) lines.push("reserver: wanted");
    } else if (data.reservation) {
        lines.push(`reserved by ${data.reservation === myUsername ? "us" : data.reservation}`);
    }

    // What the colony intends to do with the room.
    let plan: RoomPlan;
    let headline: string;
    const mined = minedSourceCount(colony, roomName);
    const expansionTarget = colony.expansionManagement?.expansionTarget;

    if (expansionTarget === roomName) {
        plan = "expanding";
        headline = controller?.my ? "founding colony" : "claiming";
        lines.push(controller?.my ? "expansion: claimed, building spawn" : "expansion: waiting on claimer");
    } else if (mined > 0) {
        plan = "mining";
        headline = `mining ${mined}/${data.sourceCount || mined}`;
        lines.push(`remote mining ${mined} source(s)`);
    } else if (alertLevel > 1) {
        plan = "avoiding";
        headline = "avoiding: threat";
        lines.push("mining paused until the alert clears");
    } else if (!data.distance || !data.lastScouted) {
        plan = "scouting";
        headline = "unscouted";
        lines.push("waiting on scout data");
    } else if (data.owner || (data.reservation && data.reservation !== myUsername)) {
        plan = "ignored";
        headline = `held by ${data.owner || data.reservation}`;
        lines.push("not ours to mine");
    } else {
        const { rank, cap } = remoteMiningRank(colony, roomName);
        if (rank >= 0 && rank < cap) {
            plan = "mining";
            headline = "mining: pending";
            lines.push("selected for remote mining, needs vision to place miners");
        } else if (cap === 0) {
            plan = "candidate";
            headline = "waiting: RCL 2";
            lines.push("remote mining unlocks at RCL 2");
        } else {
            plan = "candidate";
            headline = rank < 0 ? "not mineable" : `reserve #${rank + 1}`;
            lines.push(
                rank < 0
                    ? "no safe distance on record"
                    : `${rank + 1 - cap} closer room(s) fill the ${cap} remote slot(s)`,
            );
        }
    }

    if (plan !== "expanding") {
        lines.push(describeExpansionEligibility(data, myUsername));
    }

    const scoutStale = !data.lastScouted || Game.time - data.lastScouted > 1000;
    lines.push(`${ageText(data.lastScouted)}${scoutStale ? ", rescout due" : ""}`);
    const mineral = data.otherResources?.length ? `  mineral: ${data.otherResources.join(",")}` : "";
    lines.push(`sources: ${data.sourceCount ?? "?"}  dist: ${data.distance ?? "?"}${mineral}`);

    if (alertLevel > 0) {
        const towers =
            room && typeof room.find === "function"
                ? room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER }).length
                : 0;
        const defenders = Math.max(1, alertLevel - Math.floor(towers / 2));
        const ranged = Math.floor(alertLevel / 2);
        lines.push(`response: ${defenders} defender(s), ${ranged} ranged`);
    }

    return {
        roomName,
        colonyId: colony.id,
        alertLevel,
        alertLabel: alertLabel(alertLevel),
        color,
        plan,
        headline,
        lines,
    };
}
