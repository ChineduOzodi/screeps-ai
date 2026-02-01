import { ColonyManager } from "prototypes/colony";
import { CreepRole } from "prototypes/creep";

export class SpawningSystem {
    private colony: ColonyManager;

    public constructor(colony: ColonyManager) {
        this.colony = colony;
    }

    public run(): void {
        for (const system of this.colony.getSystemsList()) {
            for (const name in system.systemInfo.creepSpawnersInfo) {
                const creepSpawner = system.systemInfo.creepSpawnersInfo[name];
                this.cleanupCreepNames(creepSpawner);
                this.spawnManagement(creepSpawner);
            }
        }
        this.creepSpawnManager();
    }

    private cleanupCreepNames(creepSpawnManagement: CreepSpawnerProfileInfo) {
        if (!creepSpawnManagement.creepNames) {
            creepSpawnManagement.creepNames = [];
        }
        for (let i = creepSpawnManagement.creepNames.length - 1; i >= 0; i--) {
            const creepName = creepSpawnManagement.creepNames[i];
            if (creepName in Game.creeps) {
                continue;
            }
            if (creepName in this.colony.getColonyCreeps()) {
                continue;
            }

            creepSpawnManagement.creepNames.splice(i, 1);
            console.log(`Removing dead/missing creep name: ${creepName}`);
        }
    }

    private spawnManagement(oldCreepSpawn: CreepSpawnerProfileInfo) {
        if (!oldCreepSpawn.desiredAmount) {
            return;
        }
        if (!oldCreepSpawn.creepNames) {
            oldCreepSpawn.creepNames = [];
        }

        if (oldCreepSpawn.creepNames.length < oldCreepSpawn.desiredAmount) {
            const { bodyBlueprint, memoryBlueprint } = oldCreepSpawn;
            if (!bodyBlueprint || !memoryBlueprint) {
                console.log(`ERROR: spawner missing body blueprint or memory blueprint.`);
                return;
            }
            const creepName = this.colony.addToSpawnCreepQueue(bodyBlueprint, memoryBlueprint);
            if (oldCreepSpawn.important) {
                oldCreepSpawn.creepNames.unshift(creepName);
            } else {
                oldCreepSpawn.creepNames.push(creepName);
            }
        }
    }

    private creepSpawnManager() {
        const spawn = this.colony.getMainSpawn();
        if (!spawn || spawn.spawning) {
            return;
        }

        const spawnQueue = this.colony.getSpawnQueue();
        if (spawnQueue.length === 0) {
            return;
        }

        const energy = this.colony.systems.energy;
        const request = spawnQueue[0];
        const { memory, body } = request;
        const creepData = this.colony.getCreepData(memory.name);
        if (!creepData) {
            console.log(`colony | could not get creep data for ${memory.name}}`);
            return;
        }

        this.spawnCreep(spawn, spawnQueue, body, memory);
    }

    private spawnCreep(
        spawn: StructureSpawn,
        spawnQueue: SpawnRequest[],
        body: BodyPartConstant[],
        memory: CreepMemory,
    ) {
        const status = spawn.spawnCreep(body, memory.name, { memory });
        switch (status) {
            case OK:
                spawnQueue.splice(0, 1);
                break;
            case ERR_NAME_EXISTS:
                console.log(
                    `colony ${this.colony.colonyInfo.id} | spawn skipping creep since name already exists: ${memory.name}`,
                );
                spawnQueue.splice(0, 1);
                break;
            case ERR_NOT_ENOUGH_ENERGY:
                if (
                    this.colony.systems.energy.noEnergyCollectors() &&
                    (memory.spawnCost || 0) > SPAWN_ENERGY_CAPACITY
                ) {
                    console.log(
                        `ERROR: spawn creep with not enough energy and spawnCost greater the able to accumulate automatically. Memory: ${JSON.stringify(memory)}`,
                    );
                    spawnQueue.splice(0, 1);
                }
                break;
            default:
                console.log(
                    `ERROR: spawn creep returning status ${status}, body: ${JSON.stringify(body)}, memory: ${JSON.stringify(memory)}`,
                );
                console.log(`Removing spawn that is erroring out.`);
                spawnQueue.splice(0, 1);
                break;
        }
    }
}
