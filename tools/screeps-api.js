"use strict";
/**
 * Small client for the screeps.com REST API using the token in screeps.json.
 *
 * Read:
 *   node tools/screeps-api.js me                          # account, CPU limit, GCL
 *   node tools/screeps-api.js memory [shard] [path]       # size breakdown of Memory (or a sub-path)
 *   node tools/screeps-api.js dump [shard] [path] [file]  # pretty-print Memory (or a sub-path); writes to file if given
 *   node tools/screeps-api.js stats [shard]               # Memory.stats.cpu as written by the CPU budget
 *
 * Write (takes effect on the next tick):
 *   node tools/screeps-api.js debug on|off|status [shard] # toggle Logger.debug output via Memory.settings.debug
 *   node tools/screeps-api.js set <path> <json> [shard]   # write a JSON value into Memory at a dotted path
 *   node tools/screeps-api.js console <expr> [shard]      # run an expression in the game console
 *
 * The shard defaults to the first shard you own rooms on.
 */
const fs = require("fs");
const https = require("https");
const path = require("path");
const zlib = require("zlib");

const config = require(path.resolve("./screeps.json")).main;

function request(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? undefined : JSON.stringify(body);
        const headers = { "X-Token": config.token };
        if (payload !== undefined) {
            headers["Content-Type"] = "application/json; charset=utf-8";
            headers["Content-Length"] = Buffer.byteLength(payload);
        }
        const req = https.request(
            { hostname: config.hostname, port: config.port, path: urlPath, method, headers },
            res => {
                let data = "";
                res.on("data", d => (data += d));
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Bad JSON from ${urlPath}: ${data.slice(0, 200)}`));
                    }
                });
            },
        );
        req.on("error", reject);
        if (payload !== undefined) req.write(payload);
        req.end();
    });
}

const get = urlPath => request("GET", urlPath);
const post = (urlPath, body) => request("POST", urlPath, body);

function decodeMemory(data) {
    if (typeof data === "string" && data.startsWith("gz:")) {
        return JSON.parse(zlib.gunzipSync(Buffer.from(data.slice(3), "base64")).toString());
    }
    return data;
}

function ensureOk(res, what) {
    if (!res || res.ok !== 1) {
        throw new Error(`${what} failed: ${JSON.stringify(res)}`);
    }
    return res;
}

async function shards() {
    const overview = await get("/api/user/overview?interval=8&statName=energyHarvested");
    return Object.keys(overview.shards || {}).filter(s => (overview.shards[s].rooms || []).length > 0);
}

async function resolveShard(shard) {
    return shard || (await shards())[0];
}

async function readMemory(shard, memPath) {
    const sub = memPath ? `&path=${encodeURIComponent(memPath)}` : "";
    const res = ensureOk(await get(`/api/user/memory?shard=${shard}${sub}`), "memory read");
    return decodeMemory(res.data);
}

/** Writes `value` at a dotted `memPath`. Applied by the server before the next tick runs. */
async function writeMemory(shard, memPath, value) {
    return ensureOk(await post("/api/user/memory", { shard, path: memPath, value }), `memory write to ${memPath}`);
}

async function runConsole(shard, expression) {
    return ensureOk(await post("/api/user/console", { shard, expression }), "console");
}

/** Reads Memory.settings, merges the patch in, and writes the whole object back so it exists even on a fresh Memory. */
async function patchSettings(shard, patch) {
    const current = (await readMemory(shard, "settings")) || {};
    const next = Object.assign({}, current, patch);
    await writeMemory(shard, "settings", next);
    return next;
}

async function main() {
    const [cmd, a, b, c] = process.argv.slice(2);

    if (cmd === "me") {
        const me = await get("/api/auth/me");
        console.log({ username: me.username, cpu: me.cpu, cpuShard: me.cpuShard, gcl: me.gcl, power: me.power });
        console.log("shards with rooms:", await shards());
        return;
    }

    if (cmd === "memory") {
        const shard = await resolveShard(a);
        const mem = await readMemory(shard, b);
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

    if (cmd === "dump") {
        const shard = await resolveShard(a);
        const mem = await readMemory(shard, b);
        const text = JSON.stringify(mem, null, 2);
        if (c) {
            fs.writeFileSync(c, text);
            console.log(`wrote ${text.length} bytes of shard ${shard}${b ? " path " + b : ""} to ${c}`);
        } else {
            console.log(text);
        }
        return;
    }

    if (cmd === "stats") {
        const shard = await resolveShard(a);
        console.log(JSON.stringify(await readMemory(shard, "stats"), null, 2));
        return;
    }

    if (cmd === "debug") {
        const shard = await resolveShard(b);
        if (a === "on" || a === "off") {
            const settings = await patchSettings(shard, { debug: a === "on" });
            console.log(`shard ${shard}: Memory.settings.debug = ${settings.debug} (applies next tick)`);
            return;
        }
        if (a === "status" || a === undefined) {
            const settings = (await readMemory(shard, "settings")) || {};
            const legacy = await readMemory(shard, "debug");
            const effective = settings.debug !== undefined ? settings.debug === true : legacy === true;
            console.log(`shard ${shard}: debug logging ${effective ? "ON" : "OFF"}`);
            console.log(`  Memory.settings.debug = ${JSON.stringify(settings.debug)}`);
            console.log(`  Memory.debug (legacy) = ${JSON.stringify(legacy)}`);
            return;
        }
        throw new Error(`unknown debug action '${a}'; use on, off or status`);
    }

    if (cmd === "set") {
        if (!a || b === undefined) throw new Error("usage: set <path> <json> [shard]");
        let value;
        try {
            value = JSON.parse(b);
        } catch (e) {
            throw new Error(`value must be JSON (wrap strings in double quotes): ${e.message}`);
        }
        const shard = await resolveShard(c);
        await writeMemory(shard, a, value);
        console.log(`shard ${shard}: Memory.${a} = ${JSON.stringify(value)} (applies next tick)`);
        return;
    }

    if (cmd === "console") {
        if (!a) throw new Error("usage: console <expression> [shard]");
        const shard = await resolveShard(b);
        const res = await runConsole(shard, a);
        console.log(`shard ${shard}: sent ${JSON.stringify(a)}`);
        if (res.result) console.log(JSON.stringify(res.result));
        console.log("output appears in the in-game console on the next tick");
        return;
    }

    console.log(
        [
            "usage: node tools/screeps-api.js <command>",
            "  me                            account, CPU limit, GCL",
            "  memory [shard] [path]         size breakdown of Memory or a sub-path",
            "  dump [shard] [path] [file]    pretty-print Memory or a sub-path, optionally to a file",
            "  stats [shard]                 Memory.stats.cpu",
            "  debug on|off|status [shard]   toggle Logger.debug output (Memory.settings.debug)",
            "  set <path> <json> [shard]     write a JSON value at a dotted Memory path",
            "  console <expr> [shard]        run an expression in the game console",
        ].join("\n"),
    );
}

main().catch(e => {
    console.error(e.message);
    process.exit(1);
});
