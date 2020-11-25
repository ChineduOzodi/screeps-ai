import { ColonyExtras } from './colony';
export class SpawnExtras {
    spawn: StructureSpawn;
    constructor(spawn: StructureSpawn) {
        this.spawn = spawn;
    }

    run() {
        console.log('spawn running');
        if (!this.spawn.memory.colonyId) {
            this.initialRoomSetup();
        }
    }

    initialRoomSetup() {
        if (this.spawn.memory.colonyId) {
            console.error('room already setup, colony id:', this.spawn.memory.colonyId);
            return;
        }
        console.log("Creating initial colony");
        const colony: Colony = {
            id: this.spawn.room.name,
            mainSpawnId: this.spawn.id,
            spawnEnergy: 200,
            screepCount: {},
            rooms: {},
            creeps: {},
            spawnIndex: 0,
            spawnQueue: [],
            stats: {
                estimatedEnergyProductionRate: 0
            },
            energyManagement: {
                sources: []
            },
            upgradeManagement: {}
        };
        Memory.colonies[colony.id] = colony;
        this.spawn.memory.colonyId = colony.id;
    }
}