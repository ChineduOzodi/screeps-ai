export class SpawnExtras {
    public spawn: StructureSpawn;
    public constructor(spawn: StructureSpawn) {
        this.spawn = spawn;
    }

    public run(): void {
        if (!this.spawn.memory.colonyId) {
            this.initialRoomSetup();
        }
    }

    public initialRoomSetup(): void {
        if (this.spawn.memory.colonyId) {
            console.error("room already setup, colony id:", this.spawn.memory.colonyId);
            return;
        }
        console.log("Creating initial colony");
        const colony: Colony = {
            id: this.spawn.room.name,
            mainSpawnId: this.spawn.id,
            spawnEnergy: 200,
            screepCount: {},
            rooms: [],
            creeps: {},
            spawnIndex: 0,
            spawnQueue: [],
            stats: {
                estimatedEnergyProductionRate: 0
            },
            energyManagement: {
                stage: 0,
                nextUpdate: Game.time,
                sources: [],
                energyUsageModifier: 1,
                estimatedEnergyProductionRate: 0,
                totalEnergyUsagePercentageAllowed: 0
            },
            upgradeManagement: {
                upgraderEnergy: {
                    actualEnergyUsagePercentage: 0,
                    estimatedEnergyWorkRate: 0,
                    requestedEnergyUsagePercentage: 0,
                    allowedEnergyWorkRate: 0
                }
            },
            builderManagement: {
                buildQueue: [],
                builderEnergy: {
                    actualEnergyUsagePercentage: 0,
                    estimatedEnergyWorkRate: 0,
                    requestedEnergyUsagePercentage: 0,
                    allowedEnergyWorkRate: 0
                }
            },
            defenceManagement: {}
        };
        Memory.colonies[colony.id] = colony;
        this.spawn.memory.colonyId = colony.id;
    }
}
