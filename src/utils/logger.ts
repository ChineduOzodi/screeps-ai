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

export class Logger {
    private static getLogLevel(): LogLevel {
        if (typeof Memory !== "undefined" && Memory.debug) {
            return LogLevel.DEBUG;
        }
        return LogLevel.WARNING;
    }

    private static shouldPrint(options?: LogOptions): boolean {
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

        if (this.getLogLevel() <= LogLevel.DEBUG && this.shouldPrint(opts)) {
            console.log(`[DEBUG] ${message}`, ...extraArgs.filter(a => a !== undefined));
        }
    }

    public static info(message: string, options?: LogOptions | any, ...args: any[]): void {
        const opts = options && (options.isolate !== undefined || typeof options === "function") ? options : undefined;
        const extraArgs = opts ? args : [options, ...args];

        if (this.getLogLevel() <= LogLevel.INFO && this.shouldPrint(opts)) {
            console.log(`[INFO] ${message}`, ...extraArgs.filter(a => a !== undefined));
        }
    }

    public static warning(message: string, options?: LogOptions | any, ...args: any[]): void {
        const opts = options && (options.isolate !== undefined || typeof options === "function") ? options : undefined;
        const extraArgs = opts ? args : [options, ...args];

        if (this.getLogLevel() <= LogLevel.WARNING && this.shouldPrint(opts)) {
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
