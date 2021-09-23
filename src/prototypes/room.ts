import { PathfindingSystem } from "./../systems/pathfinding-system";
export class RoomExtras {
    public room: Room;

    public constructor(room: Room) {
        this.room = room;
    }

    public run(): void {
        this.visualizeReservations();
    }

    // public getTotalPotentialEnergy(): void {
    //     const totalPotentialEnergy = 0;
    //     Game.creeps;
    // }

    public visualizeReservations(): void {
        if (!this.room.memory.positionReservations) {
            return;
        }

        for (const position in this.room.memory.positionReservations) {
            const reservation = this.room.memory.positionReservations[position];
            PathfindingSystem.unreservePositions(this.room, reservation.pos);

            if (reservation.reservations.length > 0) {
                this.room.visual.circle(reservation.pos.x, reservation.pos.y);
                if (reservation.reservations.length > 1) {
                    this.room.visual.text(
                        reservation.reservations.length.toString(),
                        reservation.pos.x,
                        reservation.pos.y
                    );
                }
            }
        }
    }
}
