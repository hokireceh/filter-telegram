const fs = require('fs');
const path = require('path');
const config = require('../config/bot-config');
const fileManager = require('../utils/file-manager');
const logger = require('../utils/logger');

class MediaHandler {
    register(bot) {
        // Handle semua jenis media untuk debugging
        bot.on(['photo', 'video', 'document', 'animation', 'voice', 'audio'], (ctx, next) => {
            logger.debug(`📁 Received media: ${ctx.updateType}`);
            return next();
        });
    }

    async extractMedia(message, telegram) {
        try {
            if (!message) {
                throw new Error('Message is null or undefined');
            }

            let mediaObj = null;
            let mediaId = null;
            let fileType = null;

            // Identify media type
            if (message.photo && message.photo.length > 0) {
                const photo = message.photo[message.photo.length - 1]; // Highest resolution
                mediaObj = photo;
                mediaId = photo.file_id;
                fileType = 'photo';
            } else if (message.video) {
                mediaObj = message.video;
                mediaId = message.video.file_id;
                fileType = 'video';
            } else if (message.document) {
                mediaObj = message.document;
                mediaId = message.document.file_id;
                fileType = 'document';
            } else if (message.animation) {
                mediaObj = message.animation;
                mediaId = message.animation.file_id;
                fileType = 'animation';
            } else if (message.voice) {
                mediaObj = message.voice;
                mediaId = message.voice.file_id;
                fileType = 'voice';
            } else if (message.audio) {
                mediaObj = message.audio;
                mediaId = message.audio.file_id;
                fileType = 'audio';
            }

            if (!mediaId) {
                throw new Error('No media found in message');
            }

            // Get file info from Telegram
            const fileInfo = await telegram.getFile(mediaId);
            const fileUrl = `https://api.telegram.org/file/bot${config.token}/${fileInfo.file_path}`;

            // Download file
            const downloadResult = await fileManager.downloadFile(fileUrl);

            const mediaInfo = {
                type: fileType,
                fileId: mediaId,
                localPath: downloadResult.localPath,
                fileName: downloadResult.fileName,
                originalName: mediaObj.file_name || `${fileType}${downloadResult.extension}`,
                uuid: downloadResult.uuid,
                size: downloadResult.size,
                mimeType: mediaObj.mime_type || null,
                duration: mediaObj.duration || null,
                width: mediaObj.width || null,
                height: mediaObj.height || null,
                thumbnail: mediaObj.thumb ? mediaObj.thumb.file_id : null,
                created: new Date().toISOString()
            };

            logger.info(`✅ Media extracted: ${fileType} (${downloadResult.size} bytes)`);
            return mediaInfo;

        } catch (error) {
            logger.error('❌ Error extracting media:', error);
            throw error;
        }
    }

    async sendMedia(ctx, mediaInfo, caption = '', entities = []) {
        try {
            if (!mediaInfo || !mediaInfo.localPath) {
                throw new Error('Invalid media info');
            }

            // Check if file exists
            if (!fs.existsSync(mediaInfo.localPath)) {
                throw new Error(`Media file not found: ${mediaInfo.localPath}`);
            }

            const inputFile = { source: mediaInfo.localPath };
            const options = {
                caption: caption || undefined,
                caption_entities: entities && entities.length > 0 ? entities : undefined
            };

            switch (mediaInfo.type) {
                case 'photo':
                    await ctx.replyWithPhoto(inputFile, options);
                    break;
                case 'video':
                    await ctx.replyWithVideo(inputFile, {
                        ...options,
                        duration: mediaInfo.duration,
                        width: mediaInfo.width,
                        height: mediaInfo.height
                    });
                    break;
                case 'animation':
                    await ctx.replyWithAnimation(inputFile, {
                        ...options,
                        duration: mediaInfo.duration,
                        width: mediaInfo.width,
                        height: mediaInfo.height
                    });
                    break;
                case 'voice':
                    await ctx.replyWithVoice(inputFile, {
                        ...options,
                        duration: mediaInfo.duration
                    });
                    break;
                case 'audio':
                    await ctx.replyWithAudio(inputFile, {
                        ...options,
                        duration: mediaInfo.duration,
                        title: mediaInfo.originalName
                    });
                    break;
                case 'document':
                default:
                    await ctx.replyWithDocument(inputFile, {
                        ...options,
                        filename: mediaInfo.originalName
                    });
                    break;
            }

            logger.debug(`📤 Media sent: ${mediaInfo.type}`);

        } catch (error) {
            logger.error('❌ Error sending media:', error);
            
            // Fallback: kirim pesan error yang user-friendly
            if (caption) {
                await ctx.reply(
                    `❌ Gagal kirim media, tapi ini captionnya:\n\n${caption}`,
                    { entities: entities }
                );
            } else {
                throw error; // Re-throw jika ga ada caption fallback
            }
        }
    }

    async validateMedia(mediaInfo) {
        try {
            if (!mediaInfo || !mediaInfo.localPath) {
                return false;
            }

            const fileExists = fs.existsSync(mediaInfo.localPath);
            if (!fileExists) {
                logger.warn(`📁 Missing media file: ${mediaInfo.localPath}`);
                return false;
            }

            const fileInfo = fileManager.getFileInfo(mediaInfo.localPath);
            if (!fileInfo.exists) {
                return false;
            }

            // Check file size
            if (fileInfo.size !== mediaInfo.size) {
                logger.warn(`📁 File size mismatch: ${mediaInfo.localPath}`);
                return false;
            }

            return true;
        } catch (error) {
            logger.error('❌ Error validating media:', error);
            return false;
        }
    }

    getMediaStats() {
        try {
            const dirStats = fileManager.getDirSize();
            const database = require('../config/database');
            
            const mediaByType = {};
            Object.values(database.data.media).forEach(media => {
                mediaByType[media.type] = (mediaByType[media.type] || 0) + 1;
            });

            return {
                totalFiles: dirStats.fileCount,
                totalSize: dirStats.totalSizeMB,
                mediaInDb: Object.keys(database.data.media).length,
                typeBreakdown: mediaByType
            };
        } catch (error) {
            logger.error('❌ Error getting media stats:', error);
            return {
                totalFiles: 0,
                totalSize: 0,
                mediaInDb: 0,
                typeBreakdown: {}
            };
        }
    }
}

module.exports = new MediaHandler();
