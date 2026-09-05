export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARNING = 2,
    ERROR = 3,
}

export interface LogOptions {
    /**
     * If true or a function that returns true, the log will be printed even in isolation mode.
     */
    isolate?: boolean | (() => boolean);
}

/**
 * Global isolation mode. If true, only logs with { isolate: true } (or a function returning true) will be printed.
 * Logger.error always bypasses isolation.
 */
const ISOLATION_MODE = false;
/** Level used when Memory does not ask for debug output. Debug lines are opt-in via Memory.settings.debug. */
const DEFAULT_LOG_LEVEL = LogLevel.INFO;

const USE_MASTER_LOG_FILTER = false;
const MASTER_LOG_FILTER = (msg: string) => {
    return msg.includes("repairer");
};

export class Logger {
    /**
     * Debug logs print only while `Memory.settings.debug` is true. Toggle it from the console:
     *   Memory.settings = Memory.settings || {}; Memory.settings.debug = true;
     * The older top-level `Memory.debug` flag is still honoured when `settings.debug` is unset.
     */
    public static debugEnabled(): boolean {
        if (typeof Memory === "undefined") return false;
        const setting = Memory.settings?.debug;
        if (setting !== undefined) return setting === true;
        return Memory.debug === true;
    }

    private static getLogLevel(): LogLevel {
        return this.debugEnabled() ? LogLevel.DEBUG : DEFAULT_LOG_LEVEL;
    }

    private static shouldPrint(options?: LogOptions, msg?: string): boolean {
        if (USE_MASTER_LOG_FILTER && msg) {
            return MASTER_LOG_FILTER(msg);
        }
        if (!ISOLATION_MODE) {
            return true;
        }
        if (!options || options.isolate === undefined) {
            return false;
        }
        if (typeof options.isolate === "function") {
            return options.isolate();
        }
        return options.isolate;
    }

    public static debug(message: string, options?: LogOptions | any, ...args: any[]): void {
        const opts = options && (options.isolate !== undefined || typeof options === "function") ? options : undefined;
        const extraArgs = opts ? args : [options, ...args];

        if (this.getLogLevel() <= LogLevel.DEBUG && this.shouldPrint(opts, message)) {
            console.log(`[DEBUG] ${message}`, ...extraArgs.filter(a => a !== undefined));
        }
    }

    public static info(message: string, options?: LogOptions | any, ...args: any[]): void {
        const opts = options && (options.isolate !== undefined || typeof options === "function") ? options : undefined;
        const extraArgs = opts ? args : [options, ...args];

        if (this.getLogLevel() <= LogLevel.INFO && this.shouldPrint(opts, message)) {
            console.log(`[INFO] ${message}`, ...extraArgs.filter(a => a !== undefined));
        }
    }

    public static warning(message: string, options?: LogOptions | any, ...args: any[]): void {
        const opts = options && (options.isolate !== undefined || typeof options === "function") ? options : undefined;
        const extraArgs = opts ? args : [options, ...args];

        if (this.getLogLevel() <= LogLevel.WARNING && this.shouldPrint(opts, message)) {
            console.log(`[WARNING] ${message}`, ...extraArgs.filter(a => a !== undefined));
        }
    }

    public static error(message: string, options?: LogOptions | any, ...args: any[]): void {
        const opts = options && (options.isolate !== undefined || typeof options === "function") ? options : undefined;
        const extraArgs = opts ? args : [options, ...args];

        // Errors bypass isolation mode
        if (this.getLogLevel() <= LogLevel.ERROR) {
            console.log(`[ERROR] ${message}`, ...extraArgs.filter(a => a !== undefined));
        }
    }
}
