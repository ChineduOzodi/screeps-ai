global.Room = class {};
global.Game = {};
global.Structure = class {};
global.Spawn = class {};
global.Creep = class {};
global.RoomPosition = class {};
global.Source = class {};
global.Flag = class {};
// inject mocha globally to allow custom interface refer without direct import - bypass bundle issue
global._ = require("lodash");
global.mocha = require("mocha");
global.chai = require("chai");
global.sinon = require("sinon");
global.chai.use(require("sinon-chai"));

// Override ts-node compiler options
process.env.TS_NODE_PROJECT = "tsconfig.test.json";

// Mock Screeps Constants
global.WORK = "work";
global.CARRY = "carry";
global.MOVE = "move";
global.ATTACK = "attack";
global.RANGED_ATTACK = "ranged_attack";
global.HEAL = "heal";
global.TOUGH = "tough";
global.CLAIM = "claim";

global.RESOURCE_ENERGY = "energy";

global.SPAWN_ENERGY_CAPACITY = 300;

global.OK = 0;
global.ERR_NOT_OWNER = -1;
global.ERR_NO_PATH = -2;
global.ERR_NAME_EXISTS = -3;
global.ERR_BUSY = -4;
global.ERR_NOT_FOUND = -5;
global.ERR_NOT_ENOUGH_ENERGY = -6;
global.ERR_NOT_ENOUGH_RESOURCES = -6;
global.ERR_INVALID_TARGET = -7;
global.ERR_FULL = -8;
global.ERR_NOT_IN_RANGE = -9;
global.ERR_INVALID_ARGS = -10;
global.ERR_TIRED = -11;
global.ERR_NO_BODYPART = -12;
global.ERR_NOT_ENOUGH_EXTENSIONS = -6;
global.ERR_RCL_NOT_ENOUGH = -14;
global.ERR_GCL_NOT_ENOUGH = -15;

global.FIND_EXIT_TOP = 1;
global.FIND_EXIT_RIGHT = 3;
global.FIND_EXIT_BOTTOM = 5;
global.FIND_EXIT_LEFT = 7;
global.FIND_EXIT = 10;
global.FIND_CREEPS = 101;
global.FIND_MY_CREEPS = 102;
global.FIND_HOSTILE_CREEPS = 103;
global.FIND_SOURCES_ACTIVE = 104;
global.FIND_SOURCES = 105;
global.FIND_DROPPED_RESOURCES = 106;
global.FIND_STRUCTURES = 107;
global.FIND_MY_STRUCTURES = 108;
global.FIND_HOSTILE_STRUCTURES = 109;
global.FIND_FLAGS = 110;
global.FIND_CONSTRUCTION_SITES = 111;
global.FIND_MY_SPAWNS = 112;
global.FIND_HOSTILE_SPAWNS = 113;
global.FIND_MY_CONSTRUCTION_SITES = 114;
global.FIND_HOSTILE_CONSTRUCTION_SITES = 115;
global.FIND_MINERALS = 116;
global.FIND_NUKES = 117;
global.FIND_TOMBSTONES = 118;
global.FIND_POWER_CREEPS = 119;
global.FIND_MY_POWER_CREEPS = 120;
global.FIND_HOSTILE_POWER_CREEPS = 121;
global.FIND_DEPOSITS = 122;
global.FIND_RUINS = 123;

global.CREEP_LIFE_TIME = 1500;
global.CREEP_CLAIM_LIFE_TIME = 600;
global.CREEP_CORPSE_RATE = 0.2;

global.CARRY_CAPACITY = 50;
global.HARVEST_POWER = 2;
global.REPAIR_POWER = 100;
global.DISMANTLE_POWER = 50;
global.BUILD_POWER = 5;
global.ATTACK_POWER = 30;
global.UPGRADE_CONTROLLER_POWER = 1;
global.RANGED_ATTACK_POWER = 10;
global.HEAL_POWER = 12;
global.RANGED_HEAL_POWER = 4;

global.BODYPART_COST = {
    work: 100,
    carry: 50,
    move: 50,
    attack: 80,
    ranged_attack: 150,
    heal: 250,
    claim: 600,
    tough: 10,
};

global.STRUCTURE_EXTENSION = "extension";
global.STRUCTURE_RAMPART = "rampart";
global.STRUCTURE_ROAD = "road";
global.STRUCTURE_SPAWN = "spawn";
global.STRUCTURE_LINK = "link";
global.STRUCTURE_WALL = "constructedWall";
global.STRUCTURE_STORAGE = "storage";
global.STRUCTURE_TOWER = "tower";
global.STRUCTURE_OBSERVER = "observer";
global.STRUCTURE_POWER_SPAWN = "powerSpawn";
global.STRUCTURE_EXTRACTOR = "extractor";
global.STRUCTURE_LAB = "lab";
global.STRUCTURE_TERMINAL = "terminal";
global.STRUCTURE_CONTAINER = "container";
global.STRUCTURE_NUKER = "nuker";
global.STRUCTURE_FACTORY = "factory";
global.STRUCTURE_INVADER_CORE = "invaderCore";
global.STRUCTURE_PORTAL = "portal";
global.STRUCTURE_CONTROLLER = "controller";
global.STRUCTURE_KEEPER_LAIR = "keeperLair";
global.STRUCTURE_POWER_BANK = "powerBank";

global.OBSTACLE_OBJECT_TYPES = [
    "spawn",
    "creep",
    "powerCreep",
    "source",
    "mineral",
    "deposit",
    "controller",
    "constructedWall",
    "extension",
    "link",
    "storage",
    "tower",
    "observer",
    "powerSpawn",
    "powerBank",
    "lab",
    "terminal",
    "nuker",
    "factory",
    "invaderCore",
];

global.RoomPosition = class {
    constructor(x, y, roomName) {
        this.x = x;
        this.y = y;
        this.roomName = roomName;
    }
    findPathTo(target, opts) {
        return [];
    }
    getRangeTo(target) {
        return 1;
    }
    isEqualTo(target) {
        return target.x === this.x && target.y === this.y && target.roomName === this.roomName;
    }
};

global.PathFinder = {
    search: (from, to, opts) => ({ path: [], ops: 0, cost: 0, incomplete: false }),
    CostMatrix: class {
        constructor() {
            this._matrix = new Uint8Array(2500);
        }
        set(x, y, cost) {
            this._matrix[y * 50 + x] = cost;
        }
        get(x, y) {
            return this._matrix[y * 50 + x];
        }
        clone() {
            const newCM = new global.PathFinder.CostMatrix();
            newCM._matrix = new Uint8Array(this._matrix);
            return newCM;
        }
        serialize() {
            return Array.from(this._matrix);
        }
    },
};

global.CONTROLLER_STRUCTURES = {
    [global.STRUCTURE_SPAWN]: { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 2, 8: 3 },
    [global.STRUCTURE_EXTENSION]: { 0: 0, 1: 0, 2: 5, 3: 10, 4: 20, 5: 30, 6: 40, 7: 50, 8: 60 },
    [global.STRUCTURE_LINK]: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 2, 6: 3, 7: 4, 8: 6 },
    [global.STRUCTURE_ROAD]: { 0: 2500, 1: 2500, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500 },
    [global.STRUCTURE_WALL]: { 0: 0, 1: 0, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500 },
    [global.STRUCTURE_RAMPART]: { 0: 0, 1: 0, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500 },
    [global.STRUCTURE_STORAGE]: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 },
    [global.STRUCTURE_TOWER]: { 0: 0, 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 6 },
    [global.STRUCTURE_OBSERVER]: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 },
    [global.STRUCTURE_POWER_SPAWN]: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 },
    [global.STRUCTURE_EXTRACTOR]: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1 },
    [global.STRUCTURE_TERMINAL]: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1 },
    [global.STRUCTURE_LAB]: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 3, 7: 6, 8: 10 },
    [global.STRUCTURE_CONTAINER]: { 0: 5, 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5, 8: 5 },
    [global.STRUCTURE_NUKER]: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 },
    [global.STRUCTURE_FACTORY]: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 1, 8: 1 },
};

global.LOOK_CREEPS = "creep";
global.LOOK_ENERGY = "energy";
global.LOOK_RESOURCES = "resource";
global.LOOK_SOURCES = "source";
global.LOOK_MINERALS = "mineral";
global.LOOK_DEPOSITS = "deposit";
global.LOOK_STRUCTURES = "structure";
global.LOOK_FLAGS = "flag";
global.LOOK_CONSTRUCTION_SITES = "constructionSite";
global.LOOK_NUKES = "nuke";
global.LOOK_TERRAIN = "terrain";
global.LOOK_TOMBSTONES = "tombstone";
global.LOOK_POWER_CREEPS = "powerCreep";
global.LOOK_RUINS = "ruin";

global.TERRAIN_MASK_WALL = 1;
global.TERRAIN_MASK_SWAMP = 2;
global.TERRAIN_MASK_LAVA = 4;
