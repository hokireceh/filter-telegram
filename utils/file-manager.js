const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/bot-config');
const logger = require('./logger');

class FileManager {
    constructor() {
        this.maxFileSize = 20 * 1024 * 1024; // 20MB
        this.allowedExtensions = [
            '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
            '.mp4', '.avi', '.mkv', '.mov', '.webm',
            '.mp3', '.ogg', '.wav', '.m4a',
            '.pdf', '.doc', '.docx', '.txt', '.zip', '.rar'
        ];
    }

    async downloadFile(fileUrl, maxRetries = 3) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logger.debug(`📥 Downloading file (attempt ${attempt}/${maxRetries}): ${fileUrl}`);
                
                const uuid = uuidv4();
                const response = await axios({
                    url: fileUrl,
                    method: 'GET',
                    responseType: 'stream',
                    timeout: 30000,
                    maxContentLength: this.maxFileSize,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/2.0)'
                    }
                });

                // Ekstrak ekstensi dari URL atau header
                let extension = path.extname(new URL(fileUrl).pathname);
                if (!extension) {
                    const contentType = response.headers['content-type'];
                    extension = this.getExtensionFromMimeType(contentType);
                }

                const fileName = `${uuid}${extension}`;
                const filePath = path.join(config.mediaDir, fileName);
                
                // Validasi ekstensi
                if (!this.isAllowedExtension(extension)) {
                    throw new Error(`Ekstensi file ${extension} tidak diizinkan`);
                }

                const writer = fs.createWriteStream(filePath);
                response.data.pipe(writer);

                return new Promise((resolve, reject) => {
                    writer.on('finish', () => {
                        // Validasi ukuran file setelah download
                        const stats = fs.statSync(filePath);
                        if (stats.size > this.maxFileSize) {
                            fs.unlinkSync(filePath);
                            reject(new Error('File terlalu besar'));
                            return;
                        }
                        
                        logger.debug(`✅ File berhasil didownload: ${fileName} (${stats.size} bytes)`);
                        resolve({
                            uuid,
                            localPath: filePath,
                            fileName,
                            size: stats.size,
                            extension
                        });
                    });
                    
                    writer.on('error', reject);
                });

            } catch (error) {
                lastError = error;
                logger.warn(`❌ Download attempt ${attempt} gagal: ${error.message}`);
                
                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                    logger.debug(`⏳ Tunggu ${delay}ms sebelum retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw new Error(`Gagal download file setelah ${maxRetries} percobaan: ${lastError.message}`);
    }

    getExtensionFromMimeType(mimeType) {
        const mimeMap = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'video/mp4': '.mp4',
            'video/webm': '.webm',
            'audio/mpeg': '.mp3',
            'audio/ogg': '.ogg',
            'application/pdf': '.pdf',
            'text/plain': '.txt'
        };
        
        return mimeMap[mimeType] || '';
    }

    isAllowedExtension(extension) {
        return this.allowedExtensions.includes(extension.toLowerCase());
    }

    deleteFile(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                logger.debug(`🗑️ File dihapus: ${filePath}`);
                return true;
            }
        } catch (error) {
            logger.error(`❌ Gagal hapus file ${filePath}:`, error);
        }
        return false;
    }

    getFileInfo(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                return {
                    exists: true,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime
                };
            }
        } catch (error) {
            logger.error(`❌ Error getting file info ${filePath}:`, error);
        }
        
        return { exists: false };
    }

    cleanupOldFiles(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 hari default
        try {
            const files = fs.readdirSync(config.mediaDir);
            const now = Date.now();
            let deletedCount = 0;

            files.forEach(file => {
                const filePath = path.join(config.mediaDir, file);
                const stats = fs.statSync(filePath);
                
                if (now - stats.birthtime.getTime() > maxAge) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            });

            if (deletedCount > 0) {
                logger.info(`🧹 Cleanup: hapus ${deletedCount} file lama`);
            }

            return deletedCount;
        } catch (error) {
            logger.error('❌ Error saat cleanup file lama:', error);
            return 0;
        }
    }

    getDirSize(dirPath = config.mediaDir) {
        try {
            let totalSize = 0;
            let fileCount = 0;

            const files = fs.readdirSync(dirPath);
            files.forEach(file => {
                const filePath = path.join(dirPath, file);
                const stats = fs.statSync(filePath);
                if (stats.isFile()) {
                    totalSize += stats.size;
                    fileCount++;
                }
            });

            return {
                totalSize,
                fileCount,
                totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100
            };
        } catch (error) {
            logger.error('❌ Error getting directory size:', error);
            return { totalSize: 0, fileCount: 0, totalSizeMB: 0 };
        }
    }
}

module.exports = new FileManager();
