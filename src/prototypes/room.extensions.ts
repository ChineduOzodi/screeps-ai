interface RoomMemory {
    positionReservations: RoomPositionReservations;
    constructionProjects: Record<string, ConstructionProject>;
}

interface ConstructionProject {
    name: string;
    structures: ProjectStructure[];
    status: "planning" | "building" | "complete";
}

interface ProjectStructure {
    x: number;
    y: number;
    roomName: string;
    type: StructureConstant;
}

interface RoomPositionReservations {
    [position: string]: PositionReservations;
}

interface PositionReservations {
    pos: RoomPosition | PathStep;
    reservations: PositionReservationData[];
}

interface PositionReservationData {
    creepId: string;
    startTime: number;
    endTime: number;
    role: string;
}
