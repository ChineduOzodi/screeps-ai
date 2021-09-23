import { ColonyExtras } from "prototypes/colony";

export class SpawningSystem {
    public static run(colony: ColonyExtras, creepSpawnManagement: ColonyCreepSpawnManagement): void {
        for (let i = creepSpawnManagement.creepNames.length - 1; i >= 0; i--) {
            const creepName = creepSpawnManagement.creepNames[i];
            const colonyCreeps = colony.getColonyCreeps();
            if (!(creepName in colonyCreeps)) {
                creepSpawnManagement.creepNames.splice(i, 1);
            }
        }

        if (creepSpawnManagement.creepNames.length < creepSpawnManagement.desiredAmount) {
            const { bodyBlueprint, memoryBlueprint } = creepSpawnManagement;
            const creepName = colony.addToSpawnCreepQueue(bodyBlueprint, memoryBlueprint);
            if (creepSpawnManagement.important) {
                creepSpawnManagement.creepNames.unshift(creepName);
            } else {
                creepSpawnManagement.creepNames.push(creepName);
            }
        }
    }
}
