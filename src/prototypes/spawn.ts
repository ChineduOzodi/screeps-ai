export class SpawnExtras {
    public spawn: StructureSpawn;
    public constructor(spawn: StructureSpawn) {
        this.spawn = spawn;
    }

    public run(): void {
        const { colonyId } = this.spawn.memory;
        if (!colonyId || !Memory.colonies[colonyId] || !Game.getObjectById(Memory.colonies[colonyId]?.mainSpawnId)) {
            this.initialRoomSetup();
        }
    }

    /** Creates a colony for the room. */
    private initialRoomSetup(): void {
        console.log("Creating initial colony in room:", this.spawn.room.name);
        const colony: Colony = {
            id: this.spawn.room.name,
            mainSpawnId: this.spawn.id,
            level: 0,
            spawnEnergy: 200,
            rooms: [],
            creeps: {},
            spawnQueue: [],
            stats: {
                estimatedEnergyProductionRate: 0,
            },
            nextUpdate: 0,
        };
        Memory.colonies[colony.id] = colony;
        this.spawn.memory.colonyId = colony.id;
    }
}
