import { BaseSystemImpl } from "./base-system";
import { CreepRole } from "prototypes/types";
import { CreepSpawner } from "prototypes/CreepSpawner";
import { HarvesterCreepSpawner } from "creep-roles/harvester-creep";
import { MinerCreepSpawner } from "creep-roles/miner-creep";
import { CarrierCreepSpawner } from "creep-roles/carrier-creep";
import { ReserverCreepSpawner } from "creep-roles/reserver-creep";
import { ScoutCreepSpawner } from "creep-roles/scout-creep";

import { Action, Goal, WorldState } from "goap/types";
import { EnergyCalculator } from "utils/energy-calculator";
import { ProjectStructure } from "managers/construction-manager";
import { RemoteDiscoveryObjective } from "../objectives/remote-discovery-objective";
import { Objective } from "../objectives/types";

/**
 * Ensures that we are producing as much energy as we can from the selected rooms for a given colony.
 */
export class EnergySystem extends BaseSystemImpl {
    public override getObjectives(): Objective[] {
        return [new RemoteDiscoveryObjective(this.colony)];
    }

    public override get systemInfo(): ColonyEnergyManagement {
        if (!this.colony.colonyInfo.energyManagement) {
            this.colony.colonyInfo.energyManagement = {
                nextUpdate: Game.time,
                sources: [],
                energyUsageModifier: 1,
                estimatedEnergyProductionRate: 0,
                totalEnergyUsagePercentageAllowed: 0,
                storedEnergyPercent: 0,
            };
            this.setSources();
        } else if (
            !this.colony.colonyInfo.energyManagement.sources ||
            this.colony.colonyInfo.energyManagement.sources.length === 0
        ) {
            // Retry finding sources if the room had no vision initially
            this.setSources();
        }
        return this.colony.colonyInfo.energyManagement;
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

    public override onStart(): void {
        // Make sure system info is initiated
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        this.systemInfo;
    }

    public constructor(colony: any) {
        super(colony);
    }

    private setSources() {
        const energyManagement = this.colony.colonyInfo.energyManagement;
        if (!energyManagement) return;

        energyManagement.sources = [];
        const rooms = this.colony.colonyInfo.rooms;
        const spawn = this.colony.getMainSpawn();
        const rcl = this.colony.getMainRoom()?.controller?.level || 0;
        const desiredRemoteRoomCount = Math.floor(rcl / 2);

        // Filter and sort remote rooms by distance
        const validRemoteRooms = Object.keys(rooms)
            .filter(name => !rooms[name].isMain && rooms[name].alertLevel <= 1 && !!rooms[name].distance)
            .sort((a, b) => (rooms[a].distance || 0) - (rooms[b].distance || 0))
            .slice(0, desiredRemoteRoomCount);

        const roomsToMine = [this.colony.getMainRoom().name, ...validRemoteRooms];

        roomsToMine.forEach(roomName => {
            const roomData = rooms[roomName];
            // Only mine if alertLevel <= 1
            if (roomData.alertLevel > 1) return;

            const room = Game.rooms[roomName];
            if (!room) return; // No vision

            const sources = room.find(FIND_SOURCES);
            sources.forEach(source => {
                // Calculate available slots (walkable tiles)
                let slots = 0;
                const terrain = room.getTerrain();
                let miningPosition: RoomPosition | undefined;
                let bestDist = Infinity;

                for (let x = -1; x <= 1; x++) {
                    for (let y = -1; y <= 1; y++) {
                        if (x === 0 && y === 0) continue;
                        const px = source.pos.x + x;
                        const py = source.pos.y + y;
                        if (px < 0 || px > 49 || py < 0 || py > 49) continue;

                        const pos = new RoomPosition(px, py, roomName);
                        if (terrain.get(pos.x, pos.y) !== TERRAIN_MASK_WALL) {
                            slots++;

                            const dist = spawn ? EnergyCalculator.calculateTravelTime(spawn.pos, pos) : 0;
                            if (!miningPosition || dist < bestDist) {
                                miningPosition = pos;
                                bestDist = dist;
                            }
                        }
                    }
                }

                energyManagement.sources.push({
                    accessCount: slots,
                    sourceId: source.id,
                    position: source.pos,
                    miningPosition,
                });
            });
        });
    }

    private getRawBody(creepData: any): BodyPartConstant[] {
        const rawBody = creepData.body;
        return rawBody && rawBody[0] && typeof rawBody[0] === "object" ? rawBody.map((p: any) => p.type) : rawBody;
    }

    public getTheoreticalGrossProduction(): number {
        let totalProduction = 1; // The spawner provides 1 energy per tick until full.

        // --- Harvester Production ---
        const harvesters = this.colony.getCreeps().filter((c: any) => c.memory.role === CreepRole.HARVESTER);
        const harvesterSpawnQueue = this.colony
            .getSpawnQueue()
            .filter((r: any) => r.memory.role === CreepRole.HARVESTER);

        const allHarvesters = [
            ...harvesters,
            ...harvesterSpawnQueue.map((sq: any) => ({
                body: sq.body,
                memory: sq.memory,
            })),
        ];

        for (const creepData of allHarvesters) {
            const body = this.getRawBody(creepData);
            const memory = creepData.memory;

            if (!memory.workTargetId) continue;

            const source = Game.getObjectById<Source>(memory.workTargetId);
            if (!source) continue;

            // logic to find dropoff
            let target: Structure | null = null;
            const pos = source.pos;
            target = pos.findClosestByPath<StructureExtension | StructureSpawn>(FIND_STRUCTURES, {
                filter: (structure: Structure) => {
                    return (
                        structure.structureType === STRUCTURE_EXTENSION || structure.structureType === STRUCTURE_SPAWN
                    );
                },
            });
            if (!target) target = this.colony.getMainSpawn();

            const distSource = EnergyCalculator.calculateTravelTime(target.pos, source.pos);
            const distDropoff = distSource; // Assume round trip for now

            const production = EnergyCalculator.calculateHarvesterProductionPerTick(body, distSource, distDropoff);
            totalProduction += production;
        }

        // --- Miner/Carrier Production ---
        const miners = this.colony.getCreeps().filter((c: any) => c.memory.role === CreepRole.MINER);
        const carriers = this.colony.getCreeps().filter((c: any) => c.memory.role === CreepRole.CARRIER);

        const minerSpawnQueue = this.colony.getSpawnQueue().filter((r: any) => r.memory.role === CreepRole.MINER);
        const carrierSpawnQueue = this.colony.getSpawnQueue().filter((r: any) => r.memory.role === CreepRole.CARRIER);

        const allMiners = [...miners, ...minerSpawnQueue.map((sq: any) => ({ body: sq.body, memory: sq.memory }))];
        const allCarriers = [
            ...carriers,
            ...carrierSpawnQueue.map((sq: any) => ({ body: sq.body, memory: sq.memory })),
        ];

        if (allMiners.length > 0 && allCarriers.length > 0) {
            const sources = this.systemInfo.sources;
            const storage = this.colony.getPrimaryStorage() || this.colony.getMainSpawn();

            for (const sourceInfo of sources) {
                const sourceId = sourceInfo.sourceId;
                const minersForSource = allMiners.filter((m: any) => m.memory.workTargetId === sourceId);
                const carriersForSource = allCarriers.filter((c: any) => c.memory.workTargetId === sourceId);

                if (minersForSource.length === 0 || carriersForSource.length === 0) continue;

                let minerMiningRate = 0;
                for (const miner of minersForSource) {
                    const body = this.getRawBody(miner);
                    const workParts = body.filter((p: any) => p === WORK).length;
                    minerMiningRate += workParts * 2;
                }

                let carrierTransportRate = 0;
                // If we don't have storage yet, they go to spawn or extensions.
                // For simplicity, use the dist to storage/spawn.
                const dist = storage ? EnergyCalculator.calculateTravelTime(storage.pos, sourceInfo.position) : 25;
                const cycleTime = dist * 2 + 2; // +2 for pick/drop

                for (const carrier of carriersForSource) {
                    const body = this.getRawBody(carrier);
                    const carryParts = body.filter((p: any) => p === CARRY).length;
                    carrierTransportRate += (carryParts * 50) / cycleTime;
                }

                // A source has 3000 energy every 300 ticks = 10 energy/tick.
                // TODO: Check if it's a center room or neutral room for different rates.
                const sourceRate = 10;

                totalProduction += Math.min(minerMiningRate, carrierTransportRate, sourceRate);
            }
        }

        return totalProduction;
    }

    public override run(): void {
        super.run();

        // Periodically refresh sources to discover new remote rooms
        if (Game.time % 100 === 0) {
            this.setSources();
        }

        this.manageMiningInfrastructure();

        // Cleanup spawn queue if we switch away from Miners
        if (!this.shouldUseMiners()) {
            const spawnQueue = this.colony.getSpawnQueue();
            // Iterate backwards to safely splice
            for (let i = spawnQueue.length - 1; i >= 0; i--) {
                const role = spawnQueue[i].memory.role;
                if (role === CreepRole.MINER || role === CreepRole.CARRIER) {
                    // console.log(`Removing ${role} from queue as we are not using miners.`);
                    spawnQueue.splice(i, 1);
                }
            }
        }
    }

    public override getCreepSpawners(): CreepSpawner[] {
        const spawners: CreepSpawner[] = [new ScoutCreepSpawner()];
        if (this.shouldUseMiners()) {
            spawners.push(new MinerCreepSpawner(), new CarrierCreepSpawner(), new ReserverCreepSpawner());
        } else {
            spawners.push(new HarvesterCreepSpawner());
        }
        return spawners;
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.HARVESTER, CreepRole.MINER, CreepRole.CARRIER];
    }

    public noEnergyCollectors(): boolean {
        // Count ALIVE creeps only. If all we have are queued creeps, we still need to fall back
        // to emergency harvester mode if there are no active collectors.
        const creeps = this.colony.getCreeps();
        const collectors = creeps.filter(
            c =>
                c.memory.role === CreepRole.HARVESTER ||
                c.memory.role === CreepRole.MINER ||
                c.memory.role === CreepRole.CARRIER,
        );
        return collectors.length === 0;
    }

    public shouldUseMiners(): boolean {
        // Emergency recovery check: if no collectors are alive, fall back to harvesters
        if (this.noEnergyCollectors()) {
            return false;
        }

        /*
            When to transition?
            1. Room capacity is high enough to support a Miner (5 WORK = 500)
               Miners can sit and deplete a source just before it regenerates.
        */
        const room = this.colony.getMainRoom();
        if (!room) return false;

        const capacity = room.energyCapacityAvailable;
        return capacity >= 500;
    }

    private manageMiningInfrastructure(): void {
        if (!this.shouldUseMiners()) {
            return;
        }

        // We only build 1 container per source for now.
        if (Game.time % 20 !== 0) return;

        this.systemInfo.sources.forEach(sourceData => {
            if (!sourceData.miningPosition) this.setSources();
            if (!sourceData.miningPosition) return;

            const posObj = sourceData.miningPosition;
            const pos = new RoomPosition(posObj.x, posObj.y, posObj.roomName);
            const look = pos.lookFor(LOOK_STRUCTURES);
            const container = look.find(s => s.structureType === STRUCTURE_CONTAINER);

            if (container) return; // Already built

            const structure: ProjectStructure = {
                x: pos.x,
                y: pos.y,
                roomName: pos.roomName,
                type: STRUCTURE_CONTAINER,
            };

            this.colony.constructionManager.placeConstructionSites([structure]);
        });
    }
}
