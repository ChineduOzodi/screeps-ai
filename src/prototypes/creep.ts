import { BuilderSystem } from "./../systems/builder-system";
import { DefenceSystem } from "./../systems/defence-system";
import { MovementSystem } from "./../systems/movement-system";
import { UpgradeSystem } from "./../systems/upgrade-system";

export class CreepExtras {
    public creep: Creep;
    protected memory: CreepMemory;

    public constructor(creep: Creep) {
        this.creep = creep;
        this.memory = creep.memory;
    }

    public getColony(): Colony | undefined {
        let colony = Memory.colonies[this.creep.memory.colonyId];
        if (colony) {
            return colony;
        }
        this.creep.memory.colonyId = this.creep.room.name;
        colony = Memory.colonies[this.creep.memory.colonyId];
        if (!colony) {
            console.log(`creep: ${this.creep.id} does not have colony at ${this.creep.memory.colonyId}`);
        }
        return colony;
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    public run(): void {
        if (this.creep.spawning) {
            return;
        }

        switch (this.creep.memory.role) {
            case "upgrader":
                UpgradeSystem.runUpgraderCreep(this.creep);
                break;

            case "builder":
                BuilderSystem.runBuilderCreep(this);
                break;

            case "defender":
                DefenceSystem.runDefenderCreep(this);
                break;
            default:
                break;
        }
    }

    public getMovementSystem(): CreepMovementSystem {
        if (!this.creep.memory.movementSystem) {
            this.creep.memory.movementSystem = MovementSystem.createMovementSystem(this.creep.pos);
        }
        return this.creep.memory.movementSystem;
    }
}

export enum CreepStatus {
    WORKING = "working",
    IDLE = "idle",
    SPAWN_QUEUE = "spawn queue",
    SPAWNING = "spawning"
}
