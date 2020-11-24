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

        for (const name in this.colony.rooms) {
            const room = this.colony.rooms[name];
            this.powerManager(room);
        }

        this.creepManager();
    }

    private creepManager() {
        for (const name in this.colony.creeps) {
            const creep = this.colony.creeps[name];
            if (creep.id && !(creep.id in Game.creeps)) {
                delete this.colony.creeps[name];
                continue;
            }
        }
    }

    private powerManager(roomData: RoomData) {
        const { name, sources } = roomData;
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

    createHarvester(energy: number) {
        const attack = 80;
        const move = 50;
        const work = 100;
        const tough = 10;
        const carry = 50;
        const claim = 600;
        let numberOfParts = Math.floor((energy / (work + carry + carry + carry + move + move + move)));
        const body: BodyPartConstant[] = [];
        if (numberOfParts == 0) {
            body.push(WORK);
            body.push(CARRY);
            body.push(MOVE);
        }
        else {
            for (let i = 0; i < numberOfParts; i++) {
                body.push(WORK);
                body.push(CARRY);
                body.push(CARRY);
                body.push(CARRY);
                body.push(MOVE);
                body.push(MOVE);
                body.push(MOVE);
            }
        }

        const name = this.addToSpawnCreepQueue(body, 'harvester');
        return name;
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

        const name = this.addToSpawnCreepQueue(body, 'miner', sourceId);
        return name;
    }

    addToSpawnCreepQueue(body: BodyPartConstant[], role: string, sourceId?: string) {
        const memory: CreepMemory = {
            name: `${this.colony.id}-${role}-${this.colony.spawnIndex++}`,
            colonyId: this.colony.id,
            role,
            sourceId,
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
            sources: [],
            isMain: true
        }

        //Find Sources
        const screepRoom = this.getScreepRoom(room.name);
        const sources = room.find(FIND_SOURCES);

        sources.forEach(source => {
            screepRoom.sources.push({
                id: source.id,
                position: source.pos,
                collectorIds: []
            });
        });

        //setup initial creeps

        EnergySystem.calculateGathererCreeps(this,room);
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