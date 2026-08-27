import { CreepRole, CreepStatus } from "./types";

declare global {
    interface CreepMemory extends AddCreepToQueueOptions {
        name: string;
        colonyId: string;
        movementSystem?: CreepMovementSystem;
        targetId?: Id<
            | Tombstone
            | StructureExtension
            | AnyStructure
            | Resource<ResourceConstant>
            | Source
            | ConstructionSite<BuildableStructureConstant>
            | _HasId
        >;
        targetPos?: RoomPosition;
        working: boolean;
        workDuration: number;
        /** Set once a combat creep has tried to boost (whether or not a lab was available). */
        boostAttempted?: boolean;
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
        reservedRoomName?: string;
        reservedPos?: { x: number; y: number };
        path?: RoomPosition[];
    }

    interface CreepData {
        name: string;
        /** I believe this can be null if the creep is dead. */
        id?: Id<Creep>;
        status: CreepStatus;
    }
}
