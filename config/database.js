const fs = require('fs');
const path = require('path');
const config = require('./bot-config');
const logger = require('../utils/logger');

class Database {
    constructor() {
        this.data = {
            filters: {},
            adminCommands: {},
            media: {},
            stats: {
                created: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                totalFilters: 0,
                totalMedia: 0,
                version: '2.0'
            }
        };
        
        this.isLoaded = false;
    }

    load() {
        try {
            if (fs.existsSync(config.dbFile)) {
                const rawData = fs.readFileSync(config.dbFile, 'utf8');
                const loadedData = JSON.parse(rawData);
                
                // Merge dengan struktur default untuk backward compatibility
                this.data = {
                    ...this.data,
                    ...loadedData,
                    stats: {
                        ...this.data.stats,
                        ...loadedData.stats,
                        lastLoaded: new Date().toISOString()
                    }
                };
                
                this.isLoaded = true;
                logger.info(`✅ Database berhasil dimuat dari ${config.dbFile}`);
                logger.info(`📊 Filter: ${Object.keys(this.data.filters).length}, Media: ${Object.keys(this.data.media).length}`);
            } else {
                logger.info('📝 Database baru dibuat karena file tidak ditemukan');
                this.save();
            }
        } catch (error) {
            logger.error('❌ Error saat load database:', error);
            // Backup file rusak
            if (fs.existsSync(config.dbFile)) {
                const backupName = `${config.dbFile}.corrupt.${Date.now()}`;
                fs.copyFileSync(config.dbFile, backupName);
                logger.warn(`🚨 File database rusak, backup ke ${backupName}`);
            }
            this.save();
        }
    }

    save() {
        try {
            // Update stats
            this.data.stats.lastUpdated = new Date().toISOString();
            this.data.stats.totalFilters = Object.keys(this.data.filters).length;
            this.data.stats.totalMedia = Object.keys(this.data.media).length;
            
            // Atomic write menggunakan temp file
            const tempFile = `${config.dbFile}.tmp`;
            fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf8');
            
            // Rename temp file ke file asli (atomic operation)
            fs.renameSync(tempFile, config.dbFile);
            
            logger.debug('💾 Database berhasil disimpan');
        } catch (error) {
            logger.error('❌ Error saat save database:', error);
            throw error;
        }
    }

    // Backup database
    backup(backupPath) {
        try {
            if (!fs.existsSync(config.dbFile)) {
                throw new Error('Database file tidak ditemukan');
            }
            
            fs.copyFileSync(config.dbFile, backupPath);
            logger.info(`✅ Database berhasil dibackup ke ${backupPath}`);
            return true;
        } catch (error) {
            logger.error('❌ Error saat backup database:', error);
            return false;
        }
    }

    // Restore database
    restore(backupPath) {
        try {
            if (!fs.existsSync(backupPath)) {
                throw new Error('File backup tidak ditemukan');
            }
            
            // Validasi backup file dulu
            const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
            
            // Backup database lama dulu
            if (fs.existsSync(config.dbFile)) {
                const oldBackup = `${config.dbFile}.before-restore.${Date.now()}`;
                fs.copyFileSync(config.dbFile, oldBackup);
                logger.info(`🔄 Database lama dibackup ke ${oldBackup}`);
            }
            
            // Restore
            fs.copyFileSync(backupPath, config.dbFile);
            this.load();
            
            logger.info(`✅ Database berhasil direstore dari ${backupPath}`);
            return true;
        } catch (error) {
            logger.error('❌ Error saat restore database:', error);
            return false;
        }
    }

    // Clear unused media references
    cleanupMedia() {
        const usedMedia = new Set();
        
        // Kumpulkan semua media yang dipakai
        Object.values(this.data.filters).forEach(filter => {
            if (filter.media && Array.isArray(filter.media)) {
                filter.media.forEach(media => {
                    if (media.uuid) {
                        usedMedia.add(media.uuid);
                    }
                });
            }
        });

        // Hapus media yang tidak dipakai
        const allMedia = Object.keys(this.data.media);
        let deletedCount = 0;

        allMedia.forEach(uuid => {
            if (!usedMedia.has(uuid)) {
                delete this.data.media[uuid];
                deletedCount++;
            }
        });

        if (deletedCount > 0) {
            this.save();
            logger.info(`🧹 Cleanup media: hapus ${deletedCount} referensi yang tidak dipakai`);
        }

        return deletedCount;
    }

    // Get database stats
    getStats() {
        return {
            ...this.data.stats,
            currentTime: new Date().toISOString(),
            filtersCount: Object.keys(this.data.filters).length,
            mediaCount: Object.keys(this.data.media).length,
            databaseSize: this.getDatabaseSize()
        };
    }

    getDatabaseSize() {
        try {
            const stats = fs.statSync(config.dbFile);
            return Math.round(stats.size / 1024); // KB
        } catch (error) {
            return 0;
        }
    }
}

// Export singleton instance
module.exports = new Database();
