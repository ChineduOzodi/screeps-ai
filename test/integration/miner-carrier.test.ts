import { assert } from "chai";
import { helper } from "./helper";

describe("Miner and Carrier Integration", function () {
    this.timeout(50000); // give enough time for setup and test
    it("carrier should pull the miner to the source", async function () {
        const roomName = "W0N1";
        const roomObjects = await helper.server.world.roomObjects(roomName);
        const source = roomObjects.find((o: any) => o.type === "source");

        const gameTime = await helper.server.world.gameTime;

        // Add a controller so Spawns are active (otherwise ERR_RCL_NOT_ENOUGH -14)
        await helper.server.world.addRoomObject(roomName, "controller", 10, 10, {
            user: helper.player.id,
            level: 8,
            progress: 0,
            downgradeTime: 100000,
        });

        await helper.server.world.addRoomObject(roomName, "spawn", 16, 15, {
            name: "Spawn1",
            user: helper.player.id,
            store: { energy: 300 },
            storeCapacityResource: { energy: 300 },
            hits: 5000,
            hitsMax: 5000,
        });

        await helper.server.world.addRoomObject(roomName, "spawn", 16, 17, {
            name: "Spawn2",
            user: helper.player.id,
            store: { energy: 300 },
            storeCapacityResource: { energy: 300 },
            hits: 5000,
            hitsMax: 5000,
        });

        await helper.server.world.addRoomObject(roomName, "creep", 30, 20, {
            name: "Miner1",
            user: helper.player.id,
            body: [
                { type: "work", hits: 100 },
                { type: "work", hits: 100 },
            ],
            hits: 200,
            hitsMax: 200,
            fatigue: 0,
            store: { energy: 0 },
            storeCapacityResource: { energy: 0 },
            spawning: false,
        });

        await helper.server.world.addRoomObject(roomName, "creep", 30, 19, {
            name: "Carrier1",
            user: helper.player.id,
            body: [
                { type: "carry", hits: 100 },
                { type: "carry", hits: 100 },
                { type: "move", hits: 100 },
                { type: "move", hits: 100 },
            ],
            hits: 400,
            hitsMax: 400,
            fatigue: 0,
            store: { energy: 0 },
            storeCapacityResource: { energy: 100 },
            spawning: false,
        });

        const dbCreeps = await helper.server.world.roomObjects(roomName);
        const sourceId = dbCreeps.find((c: any) => c.type === "source")?._id || "dummy";

        const memStr = await helper.player.memory;
        const memory = typeof memStr === "string" ? JSON.parse(memStr) : memStr;

        memory.colonies = memory.colonies || {};
        memory.colonies.W0N1 = memory.colonies.W0N1 || { id: "W0N1", rooms: [], stats: {}, nextUpdate: 0 };
        memory.colonies.W0N1.energyManagement = {
            nextUpdate: 0,
            sources: [
                {
                    sourceId,
                    position: { x: 14, y: 18, roomName: "W0N1" },
                    miningPosition: { x: 17, y: 16, roomName: "W0N1" },
                },
            ],
            netValues: {},
            upgradePriority: 0,
        };

        memory.spawns = memory.spawns || {};
        memory.spawns.Spawn1 = { colonyId: "W0N1" };

        memory.creeps = memory.creeps || {};
        memory.creeps.Miner1 = {
            role: "miner",
            colonyId: "W0N1",
            workDuration: 100,
            workTargetId: sourceId,
            movementSystem: {
                previousPos: { x: 30, y: 20, roomName: "W0N1" },
                idle: 0,
                pathStuck: 0,
                idleReserved: false,
            },
        };
        memory.creeps.Carrier1 = {
            role: "carrier",
            colonyId: "W0N1",
            workDuration: 100,
            workTargetId: sourceId,
            movementSystem: {
                previousPos: { x: 30, y: 19, roomName: "W0N1" },
                idle: 0,
                pathStuck: 0,
                idleReserved: false,
            },
        };

        // Force memory injection!
        const { env } = await helper.server.world.load();
        await env.set(env.keys.MEMORY + helper.player.id, JSON.stringify(memory));

        // Give them time to do their jobs!
        for (let i = 0; i < 40; i++) {
            console.log("Starting tick", i);
            await helper.server.tick();
            console.log("Finished tick", i);

            if (i === 1 || i === 39) {
                // state collection disabled
            }
        }

        const objectsAfter = await helper.server.world.roomObjects(roomName);
        const miner = objectsAfter.find((o: any) => o.type === "creep" && o.name === "Miner1");
        const carrier = objectsAfter.find((o: any) => o.type === "creep" && o.name === "Carrier1");

        console.log("Miner in DB:", miner ? `x: ${miner.x}, y: ${miner.y}` : "NOT FOUND");
        console.log("Carrier in DB:", carrier ? `x: ${carrier.x}, y: ${carrier.y}` : "NOT FOUND");
        console.log("Source in DB:", `x: ${source.x}, y: ${source.y}`);

        let minerInRange = false;
        if (miner && source) {
            const dx = Math.abs(miner.x - source.x);
            const dy = Math.abs(miner.y - source.y);
            minerInRange = dx <= 1 && dy <= 1;
        }

        assert.equal(minerInRange, true, "Miner was not pulled to the source by the carrier");
    });
});
