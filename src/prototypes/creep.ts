import { UpgradeSystem } from './../systems/upgrade-system';
import { MovementSystem } from './../systems/movement-system';
import { EnergySystem } from "systems/energy-system";

export class CreepExtras {
    creep: Creep;

    constructor(creep: Creep) {
        this.creep = creep;
    }

    run() {
        if (this.creep.spawning) {
            return;
        }

        const colony = this.getColony();
        if (this.creep.name in colony.creeps) {
            colony.creeps[this.creep.name].id = this.creep.id;
        }
        
        MovementSystem.run(this.creep);
        
        switch (this.creep.memory.role) {
            case 'harvester':
                EnergySystem.runHarvesterCreep(this.creep);
                break;

            case 'upgrader':
                UpgradeSystem.runEnergyCreep(this.creep);
                break;
        
            default:
                break;
        }
    }

    private getColony() {
        return Memory.colonies[this.creep.memory.colonyId];
    }
}

export enum CreepStatus {
    WORKING = 'working',
    IDLE = 'idle',
    SPAWN_QUEUE = 'spawn queue',
    SPAWNING = 'spawning'
}
