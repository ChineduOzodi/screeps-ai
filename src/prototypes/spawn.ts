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

    /** Creates a colony for the room. */
    private initialRoomSetup(): void {
        if (this.spawn.memory.colonyId) {
            console.log("room already setup, colony id:", this.spawn.memory.colonyId);
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
            nextUpdate: 0
        };
        Memory.colonies[colony.id] = colony;
        this.spawn.memory.colonyId = colony.id;
    }
}
