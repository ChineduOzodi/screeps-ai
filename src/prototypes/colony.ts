import { EnergySystem } from './../systems/energy-system';
import { CreepStatus } from "./creep";

export interface Colony {
    id: string;
    spawnIndex: number;
    setupComplete?: boolean;
    spawnEnergy: number;
    screepCount: ScreepCount;
    creeps: ColonyCreeps;
    rooms: ScreepRooms;
    mainSpawnId: string;
    spawnQueue: SpawnRequest[];
    stats: ColonyStats;
    energyManagement: ColonyEnergyManagement;
}

export class ColonyExtras {
    colony: Colony;
    constructor(colony: Colony) {
        this.colony = colony;
    }

    run() {
        console.log('running colony');
        if (!this.colony.setupComplete) {
            this.colony.setupComplete = this.initialSetup();
        }

        this.creepSpawnManager();
        EnergySystem.run(this);

        for (const name in this.colony.rooms) {
            const room = this.colony.rooms[name];
            this.powerManager(room);
        }

        this.creepManager();
        this.calculateTotalEstimatedEnergyProductionRate();
        this.visualizeStats();
    }

    visualizeStats() {
        const room = this.getMainRoom();
        room.visual.text(`Colony: ${this.colony.id}`,3,5, { color: 'white', font: 1, align: 'left'});
        room.visual.text(`Energy Production: ${this.colony.stats.estimatedEnergyProductionRate.toFixed(2)}`,3,6, { color: 'white', font: 0.5 , align: 'left'});
    }

    calculateTotalEstimatedEnergyProductionRate() {
        let totalEnergyProductionRate = 0;
        const creeps = this.getCreeps();

        creeps.forEach( creep => {
            totalEnergyProductionRate += creep.memory.averageEnergyProductionPerTick? creep.memory.averageEnergyProductionPerTick : 0;
        });

        this.colony.stats.estimatedEnergyProductionRate = totalEnergyProductionRate;
    }

    getCreeps() {
        const creeps: Creep[] = [];
        for (const name in this.colony.creeps) {
            const creepData = this.colony.creeps[name];
            if (!creepData.id) {
                continue
            }
            const creep = Game.getObjectById<Creep>(creepData.id);
            if (creep) {
                creeps.push(creep);
            }
        }
        return creeps;
    }

    private creepManager() {
        for (const name in this.colony.creeps) {
            const creepData = this.colony.creeps[name];
            if (!creepData.id) {
                continue
            }
            const creep = Game.getObjectById<Creep>(creepData.id);
            if (!creep) {
                delete this.colony.creeps[name];
                continue;
            }
        }
    }

    private powerManager(roomData: RoomData) {
        const { name } = roomData;
        const room = Game.rooms[name];

        // for (const source of sources) {
        //     if (!source.minerId) {
        //         source.minerId = this.createMiner(source.id, room.energyCapacityAvailable)
        //     }
        // }
    }

    private creepSpawnManager() {
        const spawn = this.getMainSpawn();
        if (!spawn || spawn.spawning) {
            return;
        }

        if (this.colony.spawnQueue.length == 0) {
            return;
        }

        const request = this.colony.spawnQueue[0];
        const { memory, body } = request;
        const creepData = this.getCreepData(memory.name);
        if (creepData.status === CreepStatus.SPAWNING) {
            creepData.status = CreepStatus.IDLE;
            this.colony.spawnQueue.splice(0, 1);
        } else {
            const status = spawn.spawnCreep(body, memory.name, { memory });
            if (status === 0) {
                creepData.status = CreepStatus.SPAWNING;
            }
        }
    }

    createMiner(sourceId: string, energy: number) {
        let numberOfParts = Math.floor((energy / 100));

        if (numberOfParts > 7) {
            numberOfParts = 7;
        }
        else if (numberOfParts <= 2) {
            numberOfParts = 3;
        }

        const body: BodyPartConstant[] = [];
        for (let i = 0; i < numberOfParts - 2; i++) {
            body.push(WORK);
        }
        body.push(MOVE);
        body.push(MOVE);

        const name = this.addToSpawnCreepQueue(body, 'miner',  { sourceId });
        return name;
    }

    addToSpawnCreepQueue(body: BodyPartConstant[], role: string, additionalMemory?: AddCreepToQueueOptions) {
        const memory: CreepMemory = {
            ...additionalMemory,
            name: `${this.colony.id}-${role}-${this.colony.spawnIndex++}`,
            colonyId: this.colony.id,
            role,
            working: false,
            movementSystem: {
                previousPos: this.getMainSpawn().pos,
                idle: 0,
                pathStuck: 0,
                idleReserved: false,
            }
        }
        this.colony.creeps[memory.name] = {
            name: memory.name,
            status: CreepStatus.SPAWN_QUEUE
        }
        this.colony.spawnQueue.push({ body, memory });
        return memory.name;
    }

    private initialSetup() {
        this.setDesiredScreepCount('harvester', 2);

        //setup main room

        const room = this.getMainRoom();
        this.colony.rooms[room.name] = {
            name: room.name,
            isMain: true
        }

        //Find Sources
        const sources = room.find(FIND_SOURCES);

        sources.forEach(source => {
            this.colony.energyManagement.sources.push({
                sourceId: source.id,
                position: source.pos,
                desiredCarriers: 0,
                desiredHarvesters: 0,
                harvesterNames: [],
                carrierNames: []
            });
        });
        return true;
    }

    getScreepRoom(name: string) {
        return this.colony.rooms[name];
    }

    private setupRoom(room: Room) {

    }

    getMainRoom() {
        return Game.rooms[this.colony.id];
    }

    getMainSpawn() {
        const spawn = Game.getObjectById<StructureSpawn>(this.colony.mainSpawnId);
        if (!spawn) {
            throw new Error(`Could not find main spawn "${this.colony.mainSpawnId}" for ${this.colony.id}`);
        }
        return spawn;
    }

    getCreepData(name: string) {
        return this.colony.creeps[name];
    }

    getId() {
        return this.colony.id;
    }

    setDesiredScreepCount(role: string, number: number) {
        this.checkCreepCount(role);
        this.colony.screepCount[role].desired = number;
    }

    private checkCreepCount(role: string) {
        if (!this.colony.screepCount) {
            this.colony.screepCount = {};
        }

        if (!this.colony.screepCount[role]) {
            this.colony.screepCount[role] = {
                "spawning": 0,
                "count": 0,
                "desired": 0
            };
        }
    }
}

export interface ColonyCreeps {
    [name: string]: CreepData;
}