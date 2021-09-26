import { PathfindingSystem } from "./../systems/pathfinding-system";
export class RoomExtras {
    public room: Room;

    public constructor(room: Room) {
        this.room = room;
    }

    public run(): void {
        this.visualizeReservations();
        const hostiles = this.room.find(FIND_HOSTILE_CREEPS);
        const towers = this.room.find<StructureTower>(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}});

        //if there are hostiles - attack them
        if(hostiles.length > 0) {
            towers.forEach(tower => tower.attack(hostiles[0]));
        }

        //if there are no hostiles....
        if(hostiles.length === 0) {
            //....first heal any damaged creeps
            for (let name in Game.creeps) {
                // get the creep object
                var creep = Game.creeps[name];
                if (creep.hits < creep.hitsMax) {
                    towers.forEach(tower => tower.heal(creep));
                }
            }

           for(const tower of towers){
                //...repair Buildings! :) But ONLY until HALF the energy of the tower is gone.
                //Because we don't want to be exposed if something shows up at our door :)
                if(tower.store.energy > tower.store.getCapacity(RESOURCE_ENERGY) * 0.5){
                    //Find the closest damaged Structure
                    var closestDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.hits < s.hitsMax && s.structureType != STRUCTURE_WALL && s.structureType != STRUCTURE_RAMPART});
    	            if(closestDamagedStructure) {
    	 	            tower.repair(closestDamagedStructure);
                    }
                }
            }

        }
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
