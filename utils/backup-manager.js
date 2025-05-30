const fs = require('fs');
const path = require('path');
const config = require('../config/bot-config');
const logger = require('./logger');

class BackupManager {
    constructor() {
        this.maxBackupFiles = config.maxBackupFiles;
        
        // Buat direktori backup jika belum ada
        if (!fs.existsSync(config.backupDir)) {
            fs.mkdirSync(config.backupDir, { recursive: true });
        }
    }

    async createBackup(description = 'auto') {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFileName = `database-backup-${timestamp}-${description}.json`;
            const backupPath = path.join(config.backupDir, backupFileName);

            if (!fs.existsSync(config.dbFile)) {
                logger.warn('⚠️ Database file tidak ditemukan, skip backup');
                return null;
            }

            // Copy database file
            fs.copyFileSync(config.dbFile, backupPath);

            // Cleanup old backups
            this.cleanupOldBackups();

            logger.info(`✅ Backup berhasil dibuat: ${backupFileName}`);
            return backupPath;
        } catch (error) {
            logger.error('❌ Error saat membuat backup:', error);
            return null;
        }
    }

    cleanupOldBackups() {
        try {
            const backupFiles = fs.readdirSync(config.backupDir)
                .filter(file => file.startsWith('database-backup-') && file.endsWith('.json'))
                .map(file => ({
                    name: file,
                    path: path.join(config.backupDir, file),
                    stats: fs.statSync(path.join(config.backupDir, file))
                }))
                .sort((a, b) => b.stats.birthtime - a.stats.birthtime);

            // Hapus backup yang lebih dari maksimal
            if (backupFiles.length > this.maxBackupFiles) {
                const filesToDelete = backupFiles.slice(this.maxBackupFiles);
                filesToDelete.forEach(file => {
                    fs.unlinkSync(file.path);
                    logger.debug(`🗑️ Hapus backup lama: ${file.name}`);
                });
            }
        } catch (error) {
            logger.error('❌ Error saat cleanup backup lama:', error);
        }
    }

    listBackups() {
        try {
            const backupFiles = fs.readdirSync(config.backupDir)
                .filter(file => file.startsWith('database-backup-') && file.endsWith('.json'))
                .map(file => {
                    const filePath = path.join(config.backupDir, file);
                    const stats = fs.statSync(filePath);
                    
                    // Parse info dari nama file
                    const matches = file.match(/database-backup-(.+)-(.+)\.json/);
                    const timestamp = matches ? matches[1] : 'unknown';
                    const description = matches ? matches[2] : 'unknown';
                    
                    return {
                        name: file,
                        path: filePath,
                        timestamp: timestamp.replace(/-/g, ':'),
                        description,
                        size: stats.size,
                        created: stats.birthtime
                    };
                })
                .sort((a, b) => b.created - a.created);

            return backupFiles;
        } catch (error) {
            logger.error('❌ Error saat list backup:', error);
            return [];
        }
    }

    async restoreFromBackup(backupPath) {
        try {
            if (!fs.existsSync(backupPath)) {
                throw new Error('File backup tidak ditemukan');
            }

            // Validasi backup file
            const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
            if (!backupData.filters && !backupData.media) {
                throw new Error('Format backup tidak valid');
            }

            // Backup database saat ini dulu
            const currentBackup = await this.createBackup('before-restore');
            if (currentBackup) {
                logger.info(`🔄 Database saat ini dibackup ke: ${path.basename(currentBackup)}`);
            }

            // Restore database
            fs.copyFileSync(backupPath, config.dbFile);
            
            logger.info(`✅ Database berhasil direstore dari: ${path.basename(backupPath)}`);
            return true;
        } catch (error) {
            logger.error('❌ Error saat restore backup:', error);
            return false;
        }
    }

    async autoRestore() {
        try {
            // Cek apakah database ada dan valid
            if (fs.existsSync(config.dbFile)) {
                try {
                    JSON.parse(fs.readFileSync(config.dbFile, 'utf8'));
                    return false; // Database OK, tidak perlu restore
                } catch (error) {
                    logger.warn('⚠️ Database rusak, coba auto restore...');
                }
            } else {
                logger.info('📁 Database tidak ditemukan, coba auto restore...');
            }

            // Cari backup terbaru
            const backups = this.listBackups();
            if (backups.length === 0) {
                logger.info('📭 Tidak ada backup untuk restore');
                return false;
            }

            const latestBackup = backups[0];
            logger.info(`🔄 Mencoba restore dari backup terbaru: ${latestBackup.name}`);
            
            const success = await this.restoreFromBackup(latestBackup.path);
            if (success) {
                logger.info('✅ Auto restore berhasil!');
            } else {
                logger.error('❌ Auto restore gagal');
            }
            
            return success;
        } catch (error) {
            logger.error('❌ Error saat auto restore:', error);
            return false;
        }
    }

    getBackupStats() {
        try {
            const backups = this.listBackups();
            const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
            
            return {
                count: backups.length,
                totalSize,
                totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
                latest: backups[0] ? backups[0].created : null,
                oldest: backups[backups.length - 1] ? backups[backups.length - 1].created : null
            };
        } catch (error) {
            logger.error('❌ Error getting backup stats:', error);
            return { count: 0, totalSize: 0, totalSizeMB: 0, latest: null, oldest: null };
        }
    }
}

module.exports = new BackupManager();
