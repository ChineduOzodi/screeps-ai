import { CreepConstants } from './../constants/creep-constants';
import { BaseSystem } from "./base-system";
import { ColonyExtras } from "prototypes/colony";
import { SpawningSystem } from './spawning-system';

export class InfastructureSystem extends BaseSystem {
    protected override management: ColonyInfrastructureManagement;

    public constructor(colony: ColonyExtras) {
        super(colony);
        this.management = this.getManagement(colony);
    }

    public override manage(): void {
        switch (this.stage) {
            case 0: // no towers or structures
                this.manageRepairers();
                break;
            case 1: // no towers
                this.manageRepairers();
                break;
            case 2: // has towers
                this.manageRepairers();
                break;
            default:
                this.manageRepairers();
                break;
        }
    }

    protected override getManagement(colony: ColonyExtras): ColonyInfrastructureManagement {
        if (!colony.colony.infrastructureManagement) {
            colony.colony.infrastructureManagement = {
                stage: 0,
                nextUpdate: 0
            };
        }
        return colony.colony.infrastructureManagement;
    }

    public override determineStage(): number {
        if (this.colony.getMainSpawn().room.find(FIND_STRUCTURES, {
            filter: structure => {
                return structure.structureType === STRUCTURE_TOWER;
            }
        }).length > 0) {
            return 2;
        }
        if (this.colony.getMainSpawn().room.find(FIND_STRUCTURES, {
            filter: structure => {
                return structure.structureType === STRUCTURE_CONTAINER;
            }
        }).length > 0) {
            return 1;
        }
        return 0;
    }

    public override checkShouldUpdate(): boolean {
        if (this.management.nextUpdate < Game.time || this.stage !== this.management.stage) {
            this.management.nextUpdate = Game.time + 500;
            this.management.stage = this.stage;
            return true;
        }
        return false;
    }

    private manageRepairers(): void {
        if (!this.management.repairers) {
            console.log(`${this.colony.colony.id} infastructure-system | creating repairer profile`);
            this.management.repairers = this.createRepairerProfile();
        } else if (this.shouldUpdate) {
            this.management.repairers = this.updateRepairerProfile(this.management.repairers);
        }
        SpawningSystem.run(this.colony, this.management.repairers);
    }

    private createRepairerProfile(): ColonyCreepSpawnManagement {
        const maxCreepCount = this.stage === 2 ? 1 : 1; // TODO: change to not spawn repairer creeps when tower available
        const energyAvailable = this.room.energyCapacityAvailable;

        const creepBodyScale = Math.floor(energyAvailable / (CreepConstants.WORK_PART_COST + CreepConstants.CARRY_PART_COST + CreepConstants.MOVE_PART_COST))
        const body = BaseSystem.scaleCreepBody([WORK,CARRY, MOVE], creepBodyScale);

        const memory: AddCreepToQueueOptions = {
            workAmount: creepBodyScale,
            averageEnergyConsumptionProductionPerTick: creepBodyScale,
            workDuration: 2,
            role: "repairer"
        };
        const creepSpawnManagement: ColonyCreepSpawnManagement = {
            creepNames: [],
            desiredAmount: maxCreepCount,
            bodyBlueprint: body,
            memoryBlueprint: memory
        };

        return creepSpawnManagement;
    }

    private updateRepairerProfile(profile: ColonyCreepSpawnManagement): ColonyCreepSpawnManagement {
        console.log(`${this.colony.colony.id} infastructure-system | updating repairer profile`);
        const newProfile = this.createRepairerProfile();
        newProfile.creepNames = profile.creepNames;
        return newProfile;
    }

}
