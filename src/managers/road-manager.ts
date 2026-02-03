import { ColonyManager } from "../prototypes/colony";
import { ConstructionUtils } from "../utils/construction-utils";
import { ProjectStructure } from "./construction-manager";

export class RoadManager {
    private colony: ColonyManager;

    constructor(colony: ColonyManager) {
        this.colony = colony;
    }

    public planColonyRoads(): void {
        const room = this.colony.getMainRoom();
        const spawn = this.colony.getMainSpawn();
        if (!room || !spawn) return;

        const roadStructures: ProjectStructure[] = [];

        // Perimeter roads (around spawn)
        const spawnPerimeter = ConstructionUtils.getRoadsAroundPosition(spawn.pos);
        roadStructures.push(...spawnPerimeter);

        // Roads to Sources
        const sources = room.find(FIND_SOURCES);
        for (const source of sources) {
            // Plan from Spawn to Source
            // Use range 1 to get adjacent to source
            const path = ConstructionUtils.calculateRoads(spawn.pos, source.pos, 1);
            roadStructures.push(...path);
        }

        // Roads to Controller
        if (room.controller) {
            // Plan from Spawn to Controller (Range 3?)
            const path = ConstructionUtils.calculateRoads(spawn.pos, room.controller.pos, 3);
            roadStructures.push(...path);
        }

        // Submit Project
        this.colony.constructionManager.buildProject("ColonyRoads", roadStructures);
    }
}
