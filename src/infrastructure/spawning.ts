import { ColonyManager } from "prototypes/colony";
import { CreepRole } from "prototypes/creep";

export class Spawning {
    private colony: ColonyManager;

    public constructor(colony: ColonyManager) {
        this.colony = colony;
    }

    public run(): void {
        const allProfiles: CreepSpawnerProfileInfo[] = [];
        for (const system of this.colony.getSystemsList()) {
            const profiles = system.getSpawnerProfilesList();
            allProfiles.push(...profiles);
            for (const profile of profiles) {
                this.manageSpawnProfile(profile);
            }
        }

        this.pruneSpawnQueue(allProfiles);
        this.processSpawnQueue();
    }

    private pruneSpawnQueue(allProfiles: CreepSpawnerProfileInfo[]) {
        const validSignatures = new Set<string>();
        for (const profile of allProfiles) {
            if (!profile.memoryBlueprint) continue;
            const sig = this.getProfileSignature(profile.memoryBlueprint);
            validSignatures.add(sig);
        }

        const queue = this.colony.getSpawnQueue();
        // Iterate backwards to safe delete, but we use removeSpawnRequest which searches by name
        // so we should just collect names to remove first or iterate backwards and use index if we manually splice.
        // using removeSpawnRequest is safer as it cleans up creep memory map too.
        for (let i = queue.length - 1; i >= 0; i--) {
            const request = queue[i];
            const sig = this.getProfileSignature(request.memory);
            if (!validSignatures.has(sig)) {
                console.log(`Pruning orphaned spawn request: ${request.memory.role} (name: ${request.memory.name})`);
                this.colony.removeSpawnRequest(request.memory.name);
            }
        }
    }

    private getProfileSignature(memory: { role: CreepRole; workTargetId?: string }): string {
        return `${memory.role}:${memory.workTargetId || ""}`;
    }

    private manageSpawnProfile(profile: CreepSpawnerProfileInfo) {
        if (!profile.desiredAmount || !profile.memoryBlueprint || !profile.bodyBlueprint) {
            return;
        }

        const role = profile.memoryBlueprint.role;
        let currentCount = 0;

        if (profile.memoryBlueprint.workTargetId) {
            const targetId = profile.memoryBlueprint.workTargetId;
            const creeps = this.colony
                .getCreeps()
                .filter(c => c.memory.role === role && c.memory.workTargetId === targetId);
            const queued = this.colony
                .getSpawnQueue()
                .filter(r => r.memory.role === role && r.memory.workTargetId === targetId);
            currentCount = creeps.length + queued.length;
        } else {
            currentCount = this.colony.getCreepCount(role);
        }

        if (currentCount < profile.desiredAmount) {
            const options = { ...profile.memoryBlueprint };
            if (profile.priority !== undefined) {
                options.priority = profile.priority;
            }
            this.colony.addToSpawnCreepQueue(profile.bodyBlueprint, options);
        }
    }

    private processSpawnQueue() {
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
