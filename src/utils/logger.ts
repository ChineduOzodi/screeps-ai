export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARNING = 2,
    ERROR = 3,
}

export class Logger {
    private static getLogLevel(): LogLevel {
        if (typeof Memory !== "undefined" && Memory.debug) {
            return LogLevel.DEBUG;
        }
        return LogLevel.WARNING;
    }

    public static debug(message: string, ...args: any[]): void {
        if (this.getLogLevel() <= LogLevel.DEBUG) {
            console.log(`[DEBUG] ${message}`, ...args);
        }
    }

    public static info(message: string, ...args: any[]): void {
        if (this.getLogLevel() <= LogLevel.INFO) {
            console.log(`[INFO] ${message}`, ...args);
        }
    }

    public static warning(message: string, ...args: any[]): void {
        if (this.getLogLevel() <= LogLevel.WARNING) {
            console.log(`[WARNING] ${message}`, ...args);
        }
    }

    public static error(message: string, ...args: any[]): void {
        if (this.getLogLevel() <= LogLevel.ERROR) {
            console.log(`[ERROR] ${message}`, ...args);
        }
    }
}
