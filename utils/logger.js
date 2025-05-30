const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.logDir = './logs';
        
        // Buat direktori log jika belum ada
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
        
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
        
        this.currentLevel = this.levels[this.logLevel] || this.levels.info;
    }

    formatMessage(level, message, extra = null) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
        
        let formattedMessage = `${prefix} ${message}`;
        
        if (extra) {
            if (extra instanceof Error) {
                formattedMessage += `\n${extra.stack}`;
            } else if (typeof extra === 'object') {
                formattedMessage += `\n${JSON.stringify(extra, null, 2)}`;
            } else {
                formattedMessage += ` ${extra}`;
            }
        }
        
        return formattedMessage;
    }

    writeToFile(level, message) {
        try {
            const fileName = `bot-${new Date().toISOString().split('T')[0]}.log`;
            const filePath = path.join(this.logDir, fileName);
            
            fs.appendFileSync(filePath, message + '\n', 'utf8');
            
            // Cleanup old log files (keep only last 7 days)
            this.cleanupOldLogs();
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    cleanupOldLogs() {
        try {
            const files = fs.readdirSync(this.logDir);
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            files.forEach(file => {
                if (file.startsWith('bot-') && file.endsWith('.log')) {
                    const filePath = path.join(this.logDir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.birthtime < sevenDaysAgo) {
                        fs.unlinkSync(filePath);
                    }
                }
            });
        } catch (error) {
            // Ignore cleanup errors
        }
    }

    log(level, message, extra = null) {
        if (this.levels[level] <= this.currentLevel) {
            const formattedMessage = this.formatMessage(level, message, extra);
            
            // Output ke console
            switch (level) {
                case 'error':
                    console.error(formattedMessage);
                    break;
                case 'warn':
                    console.warn(formattedMessage);
                    break;
                case 'debug':
                    console.debug(formattedMessage);
                    break;
                default:
                    console.log(formattedMessage);
            }
            
            // Write to file
            this.writeToFile(level, formattedMessage);
        }
    }

    error(message, extra = null) {
        this.log('error', message, extra);
    }

    warn(message, extra = null) {
        this.log('warn', message, extra);
    }

    info(message, extra = null) {
        this.log('info', message, extra);
    }

    debug(message, extra = null) {
        this.log('debug', message, extra);
    }
}

module.exports = new Logger();
