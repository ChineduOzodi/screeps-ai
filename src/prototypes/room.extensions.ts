interface RoomMemory {
    positionReservations: RoomPositionReservations;
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
