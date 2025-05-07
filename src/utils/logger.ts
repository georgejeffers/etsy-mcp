import fs from 'fs';
import path from 'path';

class Logger {
    private logFile: string = '';
    private stream: fs.WriteStream | null = null;
    private fileLoggingEnabled: boolean = true;

    constructor() {
        // Get log directory from environment variable or use default
        const customLogPath = process.env.ETSY_MCP_LOG_PATH;
        const calculatedLogDir = customLogPath || path.join(process.cwd(), 'logs');

        console.error(`[Logger] Initializing: process.cwd() is "${process.cwd()}"`);
        console.error(`[Logger] Initializing: ETSY_MCP_LOG_PATH is "${customLogPath}"`);
        console.error(`[Logger] Initializing: Calculated logDir is "${calculatedLogDir}"`);
        
        try {
            // Create logs directory if it doesn't exist
            if (!fs.existsSync(calculatedLogDir)) {
                console.error(`[Logger] Attempting to create log directory: "${calculatedLogDir}"`);
                fs.mkdirSync(calculatedLogDir, { recursive: true });
            }

            // Create a new log file with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            this.logFile = path.join(calculatedLogDir, `mcp-server-${timestamp}.log`);
            this.stream = fs.createWriteStream(this.logFile, { flags: 'a' });
            console.error(`[Logger] File logging enabled. Log file: "${this.logFile}"`);

        } catch (error: any) {
            console.error(`[Logger] Error during file logging setup for directory "${calculatedLogDir}":`, error);
            // Handle EROFS and other file system errors
            if (error.code === 'EROFS' || error.code === 'EACCES' || error.code === 'ENOENT') {
                console.error(`[Logger] File logging disabled due to error: ${error.message}`);
                this.fileLoggingEnabled = false;
                this.stream = null;
            } else {
                // For other errors, it might be more critical, but for now, disable file logging and continue
                console.error(`[Logger] Unexpected error during file logging setup. Disabling file logging. Error: ${error.message}`);
                this.fileLoggingEnabled = false;
                this.stream = null;
                // Optionally re-throw if some errors should indeed crash the server:
                // throw error;
            }
        }
    }

    log(message: string, data?: any) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            message,
            data
        };
        
        // Write to console
        console.error(`[${timestamp}] ${message}`, data ? data : '');
        
        // Write to file if enabled
        if (this.fileLoggingEnabled && this.stream) {
            this.stream.write(JSON.stringify(logEntry) + '\n');
        }
    }

    error(message: string, error: any) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: 'error',
            message,
            error: {
                message: error.message,
                stack: error.stack,
                response: error.response?.data
            }
        };
        
        // Write to console
        console.error(`[${timestamp}] ERROR: ${message}`, error);
        
        // Write to file if enabled
        if (this.fileLoggingEnabled && this.stream) {
            this.stream.write(JSON.stringify(logEntry) + '\n');
        }
    }

    close() {
        if (this.stream) {
            this.stream.end(() => {
                console.log('Logger stream closed');
            });
        }
    }
}

export const logger = new Logger(); 