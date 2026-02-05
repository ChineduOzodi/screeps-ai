import { CreepRole, CreepStatus } from "./creep";

declare global {
    interface CreepMemory extends AddCreepToQueueOptions {
        name: string;
        colonyId: string;
        movementSystem?: CreepMovementSystem;
        targetId?: string; // TODO: convert to Id<Tombstone | StructureExtension | AnyStructure | Resource<ResourceConstant> | Source | ConstructionSite<BuildableStructureConstant> or _HasId
        targetPos?: RoomPosition;
        working: boolean;
        workDuration: number;
    }

    type TargetType = (_HasId & _HasRoomPosition) | null;

    interface AddCreepToQueueOptions {
        priority?: number;
        averageEnergyConsumptionProductionPerTick: number;
        role: CreepRole;

        workAmount?: number;
        workDuration?: number;
        workTargetId?: string;
        homeRoomName?: string;
        targetRange?: number;

        /** Total energy cost to spawn this creep. */
        spawnCost?: number;
    }

    interface CreepMovementSystem {
        previousPos: RoomPosition;
        idle: number;
        idleReserved: boolean;
        pathStuck: number;
        reservationStartTime?: number;
        reservationEndTime?: number;
        path?: PathStep[];
    }

    interface CreepData {
        name: string;
        /** I believe this can be null if the creep is dead. */
        id?: Id<Creep>;
        status: CreepStatus;
    }
}
