"use strict";
/**
 * Small read-only client for the screeps.com REST API using the token in screeps.json.
 *
 *   node tools/screeps-api.js me                  # account, CPU limit, GCL
 *   node tools/screeps-api.js memory [shard] [path]  # size breakdown of Memory (or a sub-path)
 *   node tools/screeps-api.js stats [shard]       # Memory.stats.cpu as written by the CPU budget
 */
const https = require("https");
const path = require("path");
const zlib = require("zlib");

const config = require(path.resolve("./screeps.json")).main;

function get(urlPath) {
    return new Promise((resolve, reject) => {
        const req = https.request(
            { hostname: config.hostname, port: config.port, path: urlPath, method: "GET", headers: { "X-Token": config.token } },
            res => {
                let body = "";
                res.on("data", d => (body += d));
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(new Error(`Bad JSON from ${urlPath}: ${body.slice(0, 200)}`));
                    }
                });
            },
        );
        req.on("error", reject);
        req.end();
    });
}

function decodeMemory(data) {
    if (typeof data === "string" && data.startsWith("gz:")) {
        return JSON.parse(zlib.gunzipSync(Buffer.from(data.slice(3), "base64")).toString());
    }
    return data;
}

async function shards() {
    const overview = await get("/api/user/overview?interval=8&statName=energyHarvested");
    return Object.keys(overview.shards || {}).filter(s => (overview.shards[s].rooms || []).length > 0);
}

async function main() {
    const [cmd, a, b] = process.argv.slice(2);
    if (cmd === "me") {
        const me = await get("/api/auth/me");
        console.log({ username: me.username, cpu: me.cpu, cpuShard: me.cpuShard, gcl: me.gcl, power: me.power });
        console.log("shards with rooms:", await shards());
        return;
    }
    if (cmd === "memory") {
        const shard = a || (await shards())[0];
        const sub = b ? `&path=${b}` : "";
        const res = await get(`/api/user/memory?shard=${shard}${sub}`);
        const mem = decodeMemory(res.data);
        const total = JSON.stringify(mem).length;
        console.log(`shard ${shard}${b ? " path " + b : ""}: ${total} bytes`);
        if (mem && typeof mem === "object") {
            const rows = Object.keys(mem)
                .map(k => ({ key: k, bytes: JSON.stringify(mem[k]).length }))
                .sort((x, y) => y.bytes - x.bytes);
            for (const r of rows) console.log(`  ${r.key.padEnd(24)} ${r.bytes}`);
        }
        return;
    }
    if (cmd === "stats") {
        const shard = a || (await shards())[0];
        const res = await get(`/api/user/memory?shard=${shard}&path=stats`);
        console.log(JSON.stringify(decodeMemory(res.data), null, 2));
        return;
    }
    console.log("usage: node tools/screeps-api.js me | memory [shard] [path] | stats [shard]");
}

main().catch(e => {
    console.error(e.message);
    process.exit(1);
});
