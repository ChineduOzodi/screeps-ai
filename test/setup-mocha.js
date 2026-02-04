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
global.RANGED_HEAL_POWER = 4;global.RoomPosition = class {
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

