import { BaseSystemImpl } from "./base-system";
import { CreepRole } from "prototypes/creep";
import { CreepSpawner } from "prototypes/CreepSpawner";
import { HarvesterCreep, HarvesterCreepSpawner } from "creep-roles/harvester-creep";

import { Action, Goal, WorldState } from "goap/types";
import { HarvestEnergyAction } from "goap/actions/colony-management-actions";
import { EnergyCalculator } from "utils/energy-calculator";

/**
 * Ensures that we are producing as much energy as we can from the selected rooms for a given colony.
 */
export class EnergySystem extends BaseSystemImpl {
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
        const sources = this.colony.getMainRoom().find(FIND_SOURCES);
        this.systemInfo.sources = [];

        sources.forEach(source => {
            // Calculate available slots (walkable tiles)
            let slots = 0;
            const terrain = source.room.getTerrain();
            for (let x = -1; x <= 1; x++) {
                for (let y = -1; y <= 1; y++) {
                    if (x === 0 && y === 0) continue;
                    const pos = new RoomPosition(source.pos.x + x, source.pos.y + y, source.pos.roomName);
                    if (terrain.get(pos.x, pos.y) !== TERRAIN_MASK_WALL) {
                        // Check strictly for walls. Swamps and plains are walkable.
                        // TODO: Check for existing structures that block movement?
                        slots++;
                    }
                }
            }

            this.systemInfo.sources.push({
                accessCount: slots,
                sourceId: source.id,
                position: source.pos,
            });
        });
    }

    public getTheoreticalGrossProduction(): number {
        let totalProduction = 1; // The spawner provides 1 energy per tick until full.
        const harvesters = this.colony.getCreeps().filter(c => c.memory.role === CreepRole.HARVESTER);

        // Include spawning creeps
        const spawnQueue = this.colony.getSpawnQueue().filter(r => r.memory.role === CreepRole.HARVESTER);

        const allCreeps = [
            ...harvesters,
            ...spawnQueue.map(sq => ({
                body: sq.body,
                memory: sq.memory,
            })),
        ];

        for (const creepData of allCreeps) {
            const rawBody = (creepData as any).body;
            const body: BodyPartConstant[] =
                rawBody && rawBody[0] && typeof rawBody[0] === "object" ? rawBody.map((p: any) => p.type) : rawBody;
            const memory = creepData.memory;

            if (!memory.workTargetId) continue;

            const source = Game.getObjectById<Source>(memory.workTargetId);
            if (!source) continue;

            // logic to find dropoff
            let target: Structure | null = null;
            // TODO: This logic duplicates Harvester behavior, maybe centralize?
            const pos = source.pos;
            target = pos.findClosestByPath<StructureExtension | StructureSpawn>(FIND_STRUCTURES, {
                filter: (structure: Structure) => {
                    return (
                        structure.structureType === STRUCTURE_EXTENSION || structure.structureType === STRUCTURE_SPAWN
                    );
                },
            });
            // If no immediate dropoff, maybe container? or just spawn as fallback
            if (!target) target = this.colony.getMainSpawn();

            const distSource = EnergyCalculator.calculateTravelTime(target.pos, source.pos);
            const distDropoff = distSource; // Assume round trip for now

            const production = EnergyCalculator.calculateHarvesterProductionPerTick(
                body as BodyPartConstant[],
                distSource,
                distDropoff,
            );
            totalProduction += production;
        }

        if (totalProduction === 0 && allCreeps.length > 0) {
            console.log(`[EnergySystem] Production is 0 despite ${allCreeps.length} harvesters.`);
            for (const creepData of allCreeps) {
                const memory = creepData.memory;
                const sourceId = memory.workTargetId;
                const source = sourceId ? Game.getObjectById<Source>(sourceId) : null;
                console.log(`- Creep: ${memory.name}, Target: ${sourceId}, Found: ${!!source}`);
                if (source) {
                    // Check dist calculation
                    const pos = source.pos;
                    let target = pos.findClosestByPath<StructureExtension | StructureSpawn>(FIND_STRUCTURES, {
                        filter: (structure: Structure) => {
                            return (
                                structure.structureType === STRUCTURE_EXTENSION ||
                                structure.structureType === STRUCTURE_SPAWN
                            );
                        },
                    });
                    if (!target) target = this.colony.getMainSpawn();
                    const distSource = EnergyCalculator.calculateTravelTime(target.pos, source.pos);

                    const rawBody = (creepData as any).body;
                    const body: BodyPartConstant[] =
                        rawBody && rawBody[0] && typeof rawBody[0] === "object"
                            ? rawBody.map((p: any) => p.type)
                            : rawBody;

                    const prod = EnergyCalculator.calculateHarvesterProductionPerTick(body, distSource, distSource);
                    console.log(`  - Dist: ${distSource}, Prod: ${prod}, Body: ${JSON.stringify(body)}`);
                }
            }
        }

        return totalProduction;
    }

    public override run(): void {
        super.run();
    }

    public override getCreepSpawners(): CreepSpawner[] {
        return [new HarvesterCreepSpawner()];
    }

    public override getRolesToTrackEnergy(): CreepRole[] {
        return [CreepRole.HARVESTER];
    }

    public noEnergyCollectors(): boolean {
        return this.getRoleCount(CreepRole.HARVESTER) === 0 && this.getRoleCount(CreepRole.MINER) === 0;
    }

    public override getGoapGoals(state: WorldState): Goal[] {
        const priority = !state.hasEnergy ? 100 : 20;
        const goals: Goal[] = [
            {
                name: "Harvest Energy",
                priority,
                desiredState: { hasEnergy: true },
            },
        ];
        return goals;
    }

    public override getGoapActions(): Action[] {
        return [new HarvestEnergyAction(this.colony)];
    }
}
