import { ColonyManager } from "prototypes/colony";
import { CreepStatus } from "prototypes/creep";

export class SpawningSystem {
    private colony: ColonyManager;

    public constructor(colony: ColonyManager) {
        this.colony = colony;
    }

    public run(): void {
        for (const system of this.colony.getSystemsList()) {
            for (const name in system.systemInfo.creepSpawnersInfo) {
                this.spawnManagement(system.systemInfo.creepSpawnersInfo[name]);
            }
        }
        this.creepSpawnManager();
    }

    private spawnManagement(creepSpawnManagement: ColonyCreepSpawnManagement) {
        if (!creepSpawnManagement.desiredAmount) {
            return;
        }
        if (!creepSpawnManagement.creepNames) {
            creepSpawnManagement.creepNames = [];
        }
        for (let i = creepSpawnManagement.creepNames.length - 1; i >= 0; i--) {
            const creepName = creepSpawnManagement.creepNames[i];
            const colonyCreeps = this.colony.getColonyCreeps();
            if (!(creepName in colonyCreeps)) {
                creepSpawnManagement.creepNames.splice(i, 1);
            }
        }

        if (creepSpawnManagement.creepNames.length < creepSpawnManagement.desiredAmount) {
            const { bodyBlueprint, memoryBlueprint } = creepSpawnManagement;
            if (!bodyBlueprint || !memoryBlueprint) {
                console.log(`ERROR: spawner missing body blueprint or memory blueprint.`);
                return;
            }
            const creepName = this.colony.addToSpawnCreepQueue(bodyBlueprint, memoryBlueprint);
            if (creepSpawnManagement.important) {
                creepSpawnManagement.creepNames.unshift(creepName);
            } else {
                creepSpawnManagement.creepNames.push(creepName);
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

        const request = spawnQueue[0];
        const { memory, body } = request;
        const creepData = this.colony.getCreepData(memory.name);
        if (!creepData) {
            console.log(`colony | could not get creep data for ${memory.name}}`);
            return;
        }

        if (creepData.status === CreepStatus.SPAWNING) {
            creepData.status = CreepStatus.IDLE;
            spawnQueue.splice(0, 1);
        } else {
            const status = spawn.spawnCreep(body, memory.name, { memory });
            if (status === OK) {
                creepData.status = CreepStatus.SPAWNING;
            } else if (status === ERR_NAME_EXISTS) {
                // this should take care of if a name already exists, it goes to the next spawn
                console.log(
                    `colony ${this.colony.colonyInfo.id} | spawn skipping creep since name already exists: ${memory.name}`,
                );
                spawnQueue.splice(0, 1);
            } else if (status !== ERR_NOT_ENOUGH_ENERGY) {
                console.log(`spawn status error: ${status}`);
            }
        }
    }
}
