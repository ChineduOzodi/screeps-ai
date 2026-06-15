import * as sinon from "sinon";
import { Logger, LogLevel } from "./logger";
import "../prototypes/creep.extensions";
import "../prototypes/colony.extensions";
import "../prototypes/memory.extensions";

describe("Logger", () => {
    let consoleLogStub: sinon.SinonStub;

    beforeEach(() => {
        // Mock global Memory
        (global as any).Memory = {};

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
        it("should log debug if Memory.debug is true", () => {
            (global as any).Memory.debug = true;
            Logger.debug("Debug should print");
            sinon.assert.calledWith(consoleLogStub, "[DEBUG] Debug should print");
        });

        // Since LOG_LEVEL is statically LogLevel.DEBUG, it will always print.
        // Testing that error logs print regardless of other conditions.
        it("should print errors regardless", () => {
            (global as any).Memory.debug = false;
            Logger.error("Error should always print");
            sinon.assert.calledWith(consoleLogStub, "[ERROR] Error should always print");
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
