import { ColonyExtras } from "prototypes/colony";
import { CreepExtras } from "prototypes/creep";
import { MovementSystem } from "./movement-system";
import { SpawningSystem } from "./spawning-system";

export class DefenceSystem {
    public static run(colonyExtras: ColonyExtras): void {
        const room = colonyExtras.getMainRoom();

        let stage = 0;
        if (room.controller && room.controller.level > 1) {
            stage = 0;
        }

        switch (stage) {
            case 0:
                this.manageDefenders(colonyExtras);
                break;

            default:
                break;
        }
    }

    public static manageDefenders(colonyExtras: ColonyExtras): void {
        const rooms = colonyExtras.colony.rooms;

        for (const room of rooms) {
            if (!room.defenders) {
                room.defenders = this.createDefenderProfile(colonyExtras, room.name);
            }

            const gameRoom = Game.rooms[room.name];
            if (gameRoom) {
                room.alertLevel = gameRoom.find(FIND_HOSTILE_CREEPS).length;
            }

            if (room.alertLevel > 0) {
                room.defenders.desiredAmount = room.alertLevel + 1;
            }

            SpawningSystem.run(colonyExtras, room.defenders);
        }
    }

    public static createDefenderProfile(colonyExtras: ColonyExtras, roomName: string): ColonyCreepSpawnManagement {
        const body: BodyPartConstant[] = [];

        const room = colonyExtras.getMainRoom();
        const energy = room.energyCapacityAvailable;

        const numberOfParts = Math.max(
            1,
            Math.floor(energy / (BODYPART_COST.attack + BODYPART_COST.move + BODYPART_COST.tough))
        );

        for (let i = 0; i < numberOfParts; i++) {
            body.push(TOUGH);
            body.push(MOVE);
            body.push(ATTACK);
        }

        const energyUsePerTick = 0;

        const memory: AddCreepToQueueOptions = {
            homeRoomName: roomName,
            workDuration: 5,
            role: "defender",
            averageEnergyConsumptionProductionPerTick: energyUsePerTick
        };
        const creepSpawnManagement: ColonyCreepSpawnManagement = {
            creepNames: [],
            desiredAmount: 0,
            bodyBlueprint: body,
            memoryBlueprint: memory,
            important: true
        };

        return creepSpawnManagement;
    }

    public static runDefenderCreep(creepExtras: CreepExtras): void {
        const creep = creepExtras.creep;

        let target: Creep | null = null;
        if (creep.memory.targetId) {
            target = Game.getObjectById<Creep>(creep.memory.targetId);
            if (!target) {
                delete creep.memory.targetId;
                delete creep.memory.movementSystem?.path;
            }
        } else {
            const closestHostile = creepExtras.creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS);
            creep.memory.targetId = closestHostile?.id;
            target = closestHostile;
        }

        if (target) {
            if (creep.attack(target) === ERR_NOT_IN_RANGE) {
                MovementSystem.moveToWithReservation(creep, target, creep.memory.workDuration);
            }
        }
    }
}
