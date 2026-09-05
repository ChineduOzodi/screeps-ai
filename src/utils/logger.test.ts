import { expect } from "chai";
import * as sinon from "sinon";
import { Logger } from "./logger";
import "../prototypes/creep.extensions";
import "../prototypes/colony.extensions";
import "../prototypes/memory.extensions";

describe("Logger", () => {
    let consoleLogStub: sinon.SinonStub;

    beforeEach(() => {
        // Mock global Memory with debug logging switched on so the format tests see debug output
        (global as any).Memory = { settings: { debug: true } };

        // Stub console.log
        consoleLogStub = sinon.stub(console, "log");
    });

    afterEach(() => {
        // Restore console.log
        consoleLogStub.restore();

        // Clean up global Memory
        delete (global as any).Memory;
    });

    describe("Logging Levels and Output Formats", () => {
        it("should format and output debug logs correctly", () => {
            Logger.debug("Test debug message");
            sinon.assert.calledWith(consoleLogStub, "[DEBUG] Test debug message");
        });

        it("should format and output info logs correctly", () => {
            Logger.info("Test info message");
            sinon.assert.calledWith(consoleLogStub, "[INFO] Test info message");
        });

        it("should format and output warning logs correctly", () => {
            Logger.warning("Test warning message");
            sinon.assert.calledWith(consoleLogStub, "[WARNING] Test warning message");
        });

        it("should format and output error logs correctly", () => {
            Logger.error("Test error message");
            sinon.assert.calledWith(consoleLogStub, "[ERROR] Test error message");
        });
    });

    describe("Logging with Extra Arguments", () => {
        it("should output extra arguments for debug", () => {
            Logger.debug("Message", undefined, { key: "value" });
            sinon.assert.calledWith(consoleLogStub, "[DEBUG] Message", { key: "value" });
        });

        it("should output extra arguments for info", () => {
            Logger.info("Message", undefined, 123, "extra");
            sinon.assert.calledWith(consoleLogStub, "[INFO] Message", 123, "extra");
        });

        it("should handle options object appropriately and output remaining args", () => {
            Logger.debug("Message", { isolate: true }, "arg1", "arg2");
            sinon.assert.calledWith(consoleLogStub, "[DEBUG] Message", "arg1", "arg2");
        });

        it("should treat non-options arguments as extra arguments", () => {
            Logger.debug("Message", { someNonOption: "yes" }, "arg2");
            sinon.assert.calledWith(consoleLogStub, "[DEBUG] Message", { someNonOption: "yes" }, "arg2");
        });
    });

    describe("Global Memory Configuration", () => {
        it("should not log debug by default", () => {
            (global as any).Memory = {};
            Logger.debug("Debug should not print");
            sinon.assert.notCalled(consoleLogStub);
            expect(Logger.debugEnabled()).to.equal(false);
        });

        it("should not log debug when Memory.settings.debug is false", () => {
            (global as any).Memory = { settings: { debug: false } };
            Logger.debug("Debug should not print");
            sinon.assert.notCalled(consoleLogStub);
        });

        it("should log debug when Memory.settings.debug is true", () => {
            (global as any).Memory = { settings: { debug: true } };
            Logger.debug("Debug should print");
            sinon.assert.calledWith(consoleLogStub, "[DEBUG] Debug should print");
        });

        it("should honour the legacy Memory.debug flag", () => {
            (global as any).Memory = { debug: true };
            Logger.debug("Debug should print");
            sinon.assert.calledWith(consoleLogStub, "[DEBUG] Debug should print");
        });

        it("should let Memory.settings.debug override the legacy flag", () => {
            (global as any).Memory = { debug: true, settings: { debug: false } };
            Logger.debug("Debug should not print");
            sinon.assert.notCalled(consoleLogStub);
        });

        it("should still log info, warning and error when debug is off", () => {
            (global as any).Memory = { settings: { debug: false } };
            Logger.info("Info should print");
            Logger.warning("Warning should print");
            Logger.error("Error should print");
            sinon.assert.calledWith(consoleLogStub, "[INFO] Info should print");
            sinon.assert.calledWith(consoleLogStub, "[WARNING] Warning should print");
            sinon.assert.calledWith(consoleLogStub, "[ERROR] Error should print");
        });

        it("should not log debug when Memory is undefined", () => {
            delete (global as any).Memory;
            Logger.debug("Debug should not print");
            sinon.assert.notCalled(consoleLogStub);
        });
    });

    describe("Isolation Mode Options", () => {
        it("should handle boolean isolate option", () => {
            Logger.debug("Message", { isolate: true });
            sinon.assert.calledWith(consoleLogStub, "[DEBUG] Message");
        });

        it("should handle function isolate option", () => {
            Logger.debug("Message", { isolate: () => true });
            sinon.assert.calledWith(consoleLogStub, "[DEBUG] Message");
        });

        it("should correctly strip options from args when isolate option provided", () => {
            Logger.warning("Message", { isolate: true }, "extra");
            sinon.assert.calledWith(consoleLogStub, "[WARNING] Message", "extra");
        });
    });
});
