import { BaseSystemImpl } from "./base-system";
import { CreepRole } from "prototypes/types";
import { CreepSpawner } from "prototypes/CreepSpawner";
import { ClaimerCreepSpawner } from "creep-roles/claimer-creep";
import { PioneerCreepSpawner } from "creep-roles/pioneer-creep";
import { ConstructionUtils } from "utils/construction-utils";
import { Logger } from "utils/logger";

/** Minimum RCL before a colony considers founding a new one. */
const MIN_EXPANSION_RCL = 4;
/** Don't expand into rooms further than this (approximate travel ticks). */
const MAX_EXPANSION_DISTANCE = 200;

/**
 * Founds new colonies: picks the best scouted room, claims it, places the
 * first spawn, and sends pioneers to build it. Once the spawn is finished,
 * SpawnExtras automatically registers the room as a new colony.
 */
export class ExpansionSystem extends BaseSystemImpl {
    public override get systemInfo(): ColonyExpansionManagement {
        if (!this.colony.colonyInfo.expansionManagement) {
            this.colony.colonyInfo.expansionManagement = {
                nextUpdate: Game.time,
            };
        }
        return this.colony.colonyInfo.expansionManagement;
    }

    public override get energyUsageTracking(): EnergyUsageTracking {
        if (!this.systemInfo.energyUsageTracking) {
            this.systemInfo.energyUsageTracking = {
                actualEnergyUsagePercentage: 0,
                estimatedEnergyWorkRate: 0,
                requestedEnergyUsageWeight: 0,
                allowedEnergyWorkRate: 0,
            };
        }
        return this.systemInfo.energyUsageTracking;
    }

    public override onStart(): void {}

    public constructor(colony: any) {
        super(colony);
    }

    public override run(): void {
        super.run();

        if (Game.time % 50 !== 0) return;

        const target = this.systemInfo.expansionTarget;
        if (target) {
            this.manageExpansion(target);
        } else {
            this.considerExpansion();
        }

        this.energyUsageTracking.requestedEnergyUsageWeight = this.systemInfo.expansionTarget ? 0.5 : 0;
    }

    private considerExpansion(): void {
        // GCL must allow another room
        const ownedColonies = Object.keys(Memory.colonies).length;
        if (Game.gcl.level <= ownedColonies) return;

        const room = this.colony.getMainRoom();
        if (!room || !room.controller || room.controller.level < MIN_EXPANSION_RCL) return;

        // Need enough capacity for a claimer and a healthy economy before expanding
        if (room.energyCapacityAvailable < 650) return;
        const energyInfo = this.colony.colonyInfo.energyManagement;
        if (!energyInfo || energyInfo.storedEnergyPercent < 0.4) return;

        const candidate = this.findBestExpansionCandidate();
        if (candidate) {
            Logger.info(`[Expansion] Colony ${this.colony.colonyInfo.id} expanding to ${candidate}`);
            this.systemInfo.expansionTarget = candidate;
            this.systemInfo.expansionStartTime = Game.time;
        }
    }

    private findBestExpansionCandidate(): string | undefined {
        const rooms = this.colony.colonyInfo.rooms;
        const candidates: { name: string; sourceCount: number; distance: number }[] = [];
        const myUsername = this.colony.getMainSpawn()?.owner?.username;

        for (const roomName in rooms) {
            const data = rooms[roomName];
            if (data.isMain) continue;
            if (Memory.colonies[roomName]) continue; // Already a colony
            if (data.owner) continue;
            if (data.reservation && data.reservation !== myUsername) continue; // Someone else's remote
            if (data.alertLevel > 0) continue;
            if ((data.sourceCount || 0) < 2) continue;
            if (!data.distance || data.distance > MAX_EXPANSION_DISTANCE) continue;

            candidates.push({ name: roomName, sourceCount: data.sourceCount || 0, distance: data.distance });
        }

        // Most sources first, then closest
        candidates.sort((a, b) => b.sourceCount - a.sourceCount || a.distance - b.distance);
        return candidates[0]?.name;
    }

    private manageExpansion(target: string): void {
        const targetRoom = Game.rooms[target];

        // Timeout: abandon an expansion that has made no progress for a long time.
        const started = this.systemInfo.expansionStartTime || Game.time;
        const claimed = targetRoom?.controller?.my === true;
        if (!claimed && Game.time - started > 10000) {
            Logger.warning(`[Expansion] Abandoning stalled expansion to ${target}`);
            delete this.systemInfo.expansionTarget;
            delete this.systemInfo.expansionStartTime;
            return;
        }

        if (!targetRoom || !claimed) return; // Waiting on claimer (and vision)

        // Room is claimed. Does it have a spawn yet?
        const spawns = targetRoom.find(FIND_MY_SPAWNS);
        if (spawns.length > 0) {
            Logger.info(`[Expansion] Expansion to ${target} complete — new colony is live.`);
            // Stop treating the room as a remote of this colony; it's a colony now.
            delete this.colony.colonyInfo.rooms[target];
            delete this.systemInfo.expansionTarget;
            delete this.systemInfo.expansionStartTime;
            return;
        }

        // Place the first spawn site if it's missing
        const spawnSites = targetRoom.find(FIND_MY_CONSTRUCTION_SITES, {
            filter: s => s.structureType === STRUCTURE_SPAWN,
        });
        if (spawnSites.length === 0) {
            this.placeFirstSpawn(targetRoom);
        }
    }

    private placeFirstSpawn(room: Room): void {
        const pos = ExpansionSystem.findFirstSpawnPosition(room);
        if (!pos) {
            Logger.warning(`[Expansion] Could not find a spawn position in ${room.name}`);
            return;
        }

        const result = room.createConstructionSite(pos, STRUCTURE_SPAWN);
        if (result === OK) {
            Logger.info(`[Expansion] Placed first spawn site in ${room.name} at ${pos.x},${pos.y}`);
        }
    }

    /**
     * Finds an open area for the new colony's first spawn: spirals out from the
     * controller looking for a tile whose neighbors are all buildable.
     */
    public static findFirstSpawnPosition(room: Room): RoomPosition | null {
        if (!room.controller) return null;
        const terrain = room.getTerrain();
        const anchor = room.controller.pos;

        for (let radius = 3; radius <= 10; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;

                    const x = anchor.x + dx;
                    const y = anchor.y + dy;
                    if (x < 4 || x > 45 || y < 4 || y > 45) continue;

                    const pos = new RoomPosition(x, y, room.name);
                    if (!ConstructionUtils.isTileClearForStructure(pos, room)) continue;

                    // All 8 neighbors must be walkable so the spawn isn't boxed in
                    let clear = true;
                    for (let nx = -1; nx <= 1 && clear; nx++) {
                        for (let ny = -1; ny <= 1 && clear; ny++) {
                            if (terrain.get(x + nx, y + ny) === TERRAIN_MASK_WALL) {
                                clear = false;
                            }
                        }
                    }
                    if (clear) return pos;
                }
            }
        }
        return null;
    }

    public override getCreepSpawners(): CreepSpawner[] {
        return [new ClaimerCreepSpawner(), new PioneerCreepSpawner()];
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.PIONEER];
    }

    public override getStatus(): string | null {
        const target = this.systemInfo.expansionTarget;
        if (!target) return null;

        const targetRoom = Game.rooms[target];
        if (targetRoom?.controller?.my) {
            return `Founding colony in ${target}`;
        }
        return `Claiming ${target}`;
    }
}
