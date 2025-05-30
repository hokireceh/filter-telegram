const path = require('path');

const config = {
    // Token bot dari environment variable
    token: process.env.BOT_TOKEN,
    
    // Admin IDs dari environment variable
    admins: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [],
    
    // Direktori
    dataDir: process.env.DATA_DIR || './data',
    mediaDir: process.env.MEDIA_DIR || './media',
    backupDir: process.env.BACKUP_DIR || './backups',
    
    // File database
    dbFile: path.join(process.env.DATA_DIR || './data', 'database.json'),
    
    // Rate limiting
    rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 30,
    
    // Backup settings
    autoBackup: process.env.AUTO_BACKUP === 'true',
    backupIntervalHours: parseInt(process.env.BACKUP_INTERVAL_HOURS) || 6,
    maxBackupFiles: parseInt(process.env.MAX_BACKUP_FILES) || 10,
    
    // Validasi konfigurasi
    validate() {
        if (!this.token) {
            throw new Error('❌ BOT_TOKEN tidak ditemukan di environment variables!');
        }
        
        if (this.admins.length === 0) {
            throw new Error('❌ ADMIN_IDS tidak ditemukan di environment variables!');
        }
        
        // Buat direktori jika belum ada
        const fs = require('fs');
        [this.dataDir, this.mediaDir, this.backupDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
        
        return true;
    }
};

// Validasi konfigurasi saat load
config.validate();

module.exports = config;
