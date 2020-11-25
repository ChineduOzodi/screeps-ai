import { ColonyExtras } from "prototypes/colony";

export class SpawningSystem {

    static run(colony: ColonyExtras, creepSpawnManagement: ColonyCreepSpawnManagement) {

        for (let i = creepSpawnManagement.creepNames.length - 1; i >= 0; i--) {
            const creepName = creepSpawnManagement.creepNames[i];
            if (!(creepName in colony.colony.creeps)) {
                creepSpawnManagement.creepNames.splice(i, 1);
            }
        }

        if (creepSpawnManagement.creepNames.length < creepSpawnManagement.desiredAmount) {
            const { bodyBlueprint, memoryBlueprint, role } = creepSpawnManagement;
            const creepName = colony.addToSpawnCreepQueue(bodyBlueprint, role, memoryBlueprint);
            creepSpawnManagement.creepNames.push(creepName);
        }
    }


}