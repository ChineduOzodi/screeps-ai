import { CreepRole, CreepStatus, CreepWorkPastAction } from "./creep";

declare global {
    interface CreepMemory extends AddCreepToQueueOptions {
        name: string;
        colonyId: string;
        movementSystem?: CreepMovementSystem;
        energyTrackingInfo?: EnergyTrackingInfo;
        targetId?: string; // TODO: convert to Id<Tombstone | StructureExtension | AnyStructure | Resource<ResourceConstant> | Source | ConstructionSite<BuildableStructureConstant> or _HasId
        working: boolean;
        workDuration: number;
    }

    type TargetType = (_HasId & _HasRoomPosition) | null;

    interface AddCreepToQueueOptions {
        averageEnergyConsumptionProductionPerTick: number;
        role: CreepRole;

        workAmount?: number;
        workDuration?: number;
        workTargetId?: string;
        homeRoomName?: string;
        targetRange?: number;

        // Track Energy Flow
        hasCarryParts?: boolean;
        /** To be used to keep track of last energy amount stored and use it to derive change in energy. */
        lastEnergyAmount?: number;
        /** Energy flow derived from change in lastEnergyAmount. */
        energyFlow?: number;
        /** Used to track what action the creep performed last to apply correct energy flow calculations. */
        lastAction?: CreepWorkPastAction;
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
