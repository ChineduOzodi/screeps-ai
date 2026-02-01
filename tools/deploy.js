"use strict";

const fs = require("fs");
const https = require("https");
const path = require("path");

const SCREEPS_CONFIG = "./screeps.json";
const DIST_MAIN = "dist/main.js";
const DIST_MAP = "dist/main.js.map";

function log(message) {
  console.log(`[Deploy] ${message}`);
}

function error(message) {
  console.error(`[Deploy] Error: ${message}`);
  process.exit(1);
}

// Load Config
log("Loading configuration...");
if (!fs.existsSync(SCREEPS_CONFIG)) {
  error(`Config file ${SCREEPS_CONFIG} not found.`);
}

const config = require(path.resolve(SCREEPS_CONFIG));
const destName = process.argv[2];

if (!destName) {
  error("No destination specified. Usage: node tools/deploy.js <destination>");
}

const destConfig = config[destName];
if (!destConfig) {
  error(`Destination '${destName}' not found in ${SCREEPS_CONFIG}`);
}

// Validate Config
if (!destConfig.token && (!destConfig.email || !destConfig.password)) {
  error("Destination must have 'token' or 'email' and 'password'.");
}

const hostname = destConfig.hostname || "screeps.com";
const port = destConfig.port || 443;
const protocol = destConfig.protocol || "https";
const branch = destConfig.branch || "default";

// Read Build Files
log("Reading build files...");
let mainContent = "";
let mapContent = "";

try {
  mainContent = fs.readFileSync(DIST_MAIN, "utf8");
} catch (e) {
  error(`Failed to read ${DIST_MAIN}: ${e.message}`);
}

// Optional map file
if (fs.existsSync(DIST_MAP)) {
    mapContent = fs.readFileSync(DIST_MAP, "utf8");
}

const modules = {
  main: mainContent,
};

if (mapContent) {
  modules["main.js.map"] = "module.exports = " + mapContent + ";";
}

// API Request
const postData = {
  branch: branch,
  modules: modules,
};

const options = {
  hostname: hostname,
  port: port,
  path: "/api/user/code",
  method: "POST",
  headers: {
    "Content-Type": "application/json; charset=utf-8",
  },
};

if (destConfig.token) {
  options.headers["X-Token"] = destConfig.token;
  options.headers["X-Username"] = destConfig.token; // Sometimes needed/used
} else {
  // Basic Auth or Email/Password handling is more complex with modern API,
  // but standard Screeps API usually supports Basic Auth or just Token.
  // Implementing Basic Auth as fallback if supported by server (private servers often do).
  const auth = Buffer.from(`${destConfig.email}:${destConfig.password}`).toString("base64");
  options.headers["Authorization"] = `Basic ${auth}`;
}

log(`Deploying to ${protocol}://${hostname}:${port} on branch '${branch}'...`);

const req = (protocol === 'http' ? require('http') : https).request(options, (res) => {
  let responseData = "";

  res.setEncoding("utf8");
  res.on("data", (chunk) => {
    responseData += chunk;
  });

  res.on("end", () => {
    try {
      const data = JSON.parse(responseData);
      if (data.ok) {
        log(`Success! Result: ${JSON.stringify(data)}`);
      } else {
        error(`API Error: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      error(`Invalid response: ${responseData}`);
    }
  });
});

req.on("error", (e) => {
  error(`Request failed: ${e.message}`);
});

req.write(JSON.stringify(postData));
req.end();
