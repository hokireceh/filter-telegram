const database = require('../config/database');
const mediaHandler = require('./media-handler');
const logger = require('../utils/logger');

class FilterCommands {
    constructor() {
        this.deleteConfirmations = new Map();
    }

    register(bot) {
        // Add filter command
        bot.hears(/^!add (.+)$|^!a (.+)$/, async (ctx) => {
            const keyword = (ctx.match[1] || ctx.match[2]).trim();
            
            // Hapus command message setelah 3 detik
            setTimeout(() => {
                ctx.deleteMessage(ctx.message.message_id).catch(() => {});
            }, 3000);

            // Validasi keyword
            if (keyword.length < 2) {
                return ctx.reply('❌ Keyword minimal 2 karakter anjir!');
            }

            if (keyword.length > 50) {
                return ctx.reply('❌ Keyword kepanjangan cok! Maksimal 50 karakter.');
            }

            // Cek apakah ini balasan ke pesan lain
            if (!ctx.message.reply_to_message) {
                return ctx.reply(
                    '❌ Eh anjir! Reply ke pesan yang mau dijadiin filter!\n\n' +
                    'Cara pakai:\n' +
                    '1. Reply ke pesan yang ada text/media\n' +
                    '2. Ketik `!add nama_filter`\n' +
                    '3. Done! Filter siap dipake 🔥'
                );
            }

            try {
                const replyMsg = ctx.message.reply_to_message;
                const content = {
                    text: replyMsg.text || replyMsg.caption || '',
                    entities: replyMsg.entities || replyMsg.caption_entities || [],
                    media: []
                };

                // Proses media jika ada
                if (this.hasMedia(replyMsg)) {
                    const mediaInfo = await mediaHandler.extractMedia(replyMsg, ctx.telegram);
                    if (mediaInfo) {
                        content.media.push(mediaInfo);
                        database.data.media[mediaInfo.uuid] = mediaInfo;
                    }
                }

                // Validasi content tidak kosong
                if (!content.text && content.media.length === 0) {
                    return ctx.reply('❌ Pesan yang di-reply kosong cok! Gaada text atau media.');
                }

                // Simpan filter
                const isUpdate = !!database.data.filters[keyword];
                database.data.filters[keyword] = content;
                database.save();

                logger.info(`✅ Filter ${isUpdate ? 'updated' : 'created'}: ${keyword}`);
                
                ctx.reply(
                    `✅ Filter "${keyword}" ${isUpdate ? 'udah diupdate' : 'berhasil ditambah'} cok!\n\n` +
                    `Sekarang ketik \`!${keyword}\` buat pake filter ini.\n` +
                    `${content.media.length > 0 ? '📁 Dengan media: ' + content.media.length + ' file' : ''}`
                );

            } catch (error) {
                logger.error('Error creating filter:', error);
                ctx.reply('❌ Error pas bikin filter anjir! Coba lagi.');
            }
        });

        // Delete filter command
        bot.hears(/^!del (.+)$|^!d (.+)$/, async (ctx) => {
            const keyword = (ctx.match[1] || ctx.match[2]).trim();
            const msgId = ctx.message.message_id;

            if (!database.data.filters[keyword]) {
                return ctx.reply(`❌ Filter "${keyword}" gaada cok!`);
            }

            try {
                // Kirim konfirmasi dengan tombol
                const confirmMessage = await ctx.reply(
                    `⚠️ KONFIRMASI HAPUS FILTER\n\n` +
                    `Yakin mau hapus filter "${keyword}"?\n` +
                    `Ini gabisa di-undo lho cok!`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '✅ Yakin, Hapus!', callback_data: `del_confirm_${keyword}_${msgId}` },
                                { text: '❌ Batal', callback_data: `del_cancel_${keyword}_${msgId}` }
                            ]]
                        }
                    }
                );

                // Auto-delete konfirmasi setelah 30 detik
                setTimeout(async () => {
                    try {
                        await ctx.telegram.deleteMessage(ctx.chat.id, confirmMessage.message_id);
                        await ctx.deleteMessage(msgId);
                    } catch (error) {
                        // Ignore delete errors
                    }
                }, 30000);

            } catch (error) {
                logger.error('Error creating delete confirmation:', error);
                ctx.reply('❌ Error pas bikin konfirmasi hapus cok!');
            }
        });

        // Handle delete confirmation
        bot.action(/^del_confirm_(.+)_(\d+)$/, async (ctx) => {
            try {
                const fullMatch = ctx.match[1];
                const msgId = ctx.match[2];
                
                // Parse keyword (handle underscore dalam keyword)
                const parts = fullMatch.split('_');
                const keyword = parts.slice(0, -1).join('_'); // Semua kecuali elemen terakhir
                
                if (!database.data.filters[keyword]) {
                    return ctx.editMessageText(`❌ Filter "${keyword}" udah gaada cok!`);
                }

                // Hapus media files jika ada
                const filter = database.data.filters[keyword];
                if (filter.media && filter.media.length > 0) {
                    const fileManager = require('../utils/file-manager');
                    filter.media.forEach(media => {
                        if (media.localPath) {
                            fileManager.deleteFile(media.localPath);
                        }
                        if (media.uuid) {
                            delete database.data.media[media.uuid];
                        }
                    });
                }

                // Hapus filter
                delete database.data.filters[keyword];
                database.save();

                logger.info(`🗑️ Filter deleted: ${keyword}`);
                
                ctx.editMessageText(
                    `✅ Filter "${keyword}" udah dihapus anjir!\n\n` +
                    `Sekarang gabisa dipake lagi. RIP! 💀`
                );

                // Hapus command message
                try {
                    await ctx.deleteMessage(parseInt(msgId));
                } catch (error) {
                    // Ignore if message already deleted
                }

            } catch (error) {
                logger.error('Error deleting filter:', error);
                ctx.editMessageText('❌ Error pas hapus filter cok!');
            }
        });

        // Handle delete cancel
        bot.action(/^del_cancel_(.+)_(\d+)$/, async (ctx) => {
            const fullMatch = ctx.match[1];
            const msgId = ctx.match[2];
            
            const parts = fullMatch.split('_');
            const keyword = parts.slice(0, -1).join('_');
            
            ctx.editMessageText(`❌ Hapus filter "${keyword}" dibatalin cok!`);
            
            // Hapus command message
            try {
                await ctx.deleteMessage(parseInt(msgId));
            } catch (error) {
                // Ignore if message already deleted
            }
        });

        // List filters command
        bot.hears(/^!list$|^!l$/, async (ctx) => {
            const filters = Object.keys(database.data.filters);
            
            if (filters.length === 0) {
                return ctx.reply(
                    '📭 Belum ada filter yang dibuat cok!\n\n' +
                    'Bikin filter baru:\n' +
                    '1. Reply ke pesan yang mau dijadiin filter\n' +
                    '2. Ketik `!add nama_filter`\n' +
                    '3. Done! 🔥'
                );
            }

            // Group filters by pages (max 20 per page)
            const itemsPerPage = 20;
            const totalPages = Math.ceil(filters.length / itemsPerPage);
            
            if (totalPages === 1) {
                const filterList = filters.map((filter, index) => {
                    const filterData = database.data.filters[filter];
                    const hasMedia = filterData.media && filterData.media.length > 0;
                    const mediaIcon = hasMedia ? '📁' : '📝';
                    return `${index + 1}. ${mediaIcon} ${filter}`;
                }).join('\n');

                const text = 
                    `📋 DAFTAR FILTER (${filters.length}):\n\n` +
                    `${filterList}\n\n` +
                    `📝 = Text only\n` +
                    `📁 = With media\n\n` +
                    `Ketik !nama_filter buat pake anjir!`;

                ctx.reply(text);
            } else {
                // Multiple pages - show with navigation
                this.showFilterPage(ctx, 1, totalPages, filters, itemsPerPage);
            }
        });

        // Handle filter pagination
        bot.action(/^filter_page_(\d+)_(\d+)$/, async (ctx) => {
            const currentPage = parseInt(ctx.match[1]);
            const totalPages = parseInt(ctx.match[2]);
            const filters = Object.keys(database.data.filters);
            const itemsPerPage = 20;
            
            this.showFilterPage(ctx, currentPage, totalPages, filters, itemsPerPage, true);
        });

        // Use filter command
        bot.hears(/^!([a-zA-Z0-9_-]+)$/, async (ctx) => {
            const keyword = ctx.match[1];
            
            if (['add', 'a', 'del', 'd', 'list', 'l'].includes(keyword)) {
                return; // Skip reserved commands
            }

            const filter = database.data.filters[keyword];
            if (!filter) {
                return ctx.reply(
                    `❌ Filter "${keyword}" gaada cok!\n\n` +
                    `Ketik \`!list\` buat liat semua filter yang ada.`
                );
            }

            try {
                // Hapus command message
                setTimeout(() => {
                    ctx.deleteMessage(ctx.message.message_id).catch(() => {});
                }, 1000);

                // Kirim media dulu jika ada
                if (filter.media && filter.media.length > 0) {
                    for (const media of filter.media) {
                        await mediaHandler.sendMedia(ctx, media, filter.text, filter.entities);
                    }
                } else if (filter.text) {
                    // Kirim text dengan entities jika ada
                    await ctx.reply(filter.text, {
                        entities: filter.entities || []
                    });
                }

                logger.debug(`✅ Filter used: ${keyword}`);

            } catch (error) {
                logger.error(`Error using filter ${keyword}:`, error);
                ctx.reply('❌ Error pas pake filter anjir! Mungkin file-nya udah gaada.');
            }
        });
    }

    showFilterPage(ctx, currentPage, totalPages, filters, itemsPerPage, isEdit = false) {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, filters.length);
        const pageFilters = filters.slice(startIndex, endIndex);

        const filterList = pageFilters.map((filter, index) => {
            const filterData = database.data.filters[filter];
            const hasMedia = filterData.media && filterData.media.length > 0;
            const mediaIcon = hasMedia ? '📁' : '📝';
            return `${startIndex + index + 1}. ${mediaIcon} ${filter}`;
        }).join('\n');

        const text = 
            `📋 DAFTAR FILTER (${filters.length}):\n\n` +
            `${filterList}\n\n` +
            `📄 Halaman ${currentPage}/${totalPages}\n\n` +
            `📝 = Text only\n` +
            `📁 = With media\n\n` +
            `Ketik !nama_filter buat pake anjir!`;

        // Navigation buttons
        const keyboard = [];
        const navRow = [];

        if (currentPage > 1) {
            navRow.push({
                text: '⬅️ Sebelumnya',
                callback_data: `filter_page_${currentPage - 1}_${totalPages}`
            });
        }

        if (currentPage < totalPages) {
            navRow.push({
                text: 'Selanjutnya ➡️',
                callback_data: `filter_page_${currentPage + 1}_${totalPages}`
            });
        }

        if (navRow.length > 0) {
            keyboard.push(navRow);
        }

        const options = {
            reply_markup: { inline_keyboard: keyboard }
        };

        if (isEdit) {
            ctx.editMessageText(text, options);
        } else {
            ctx.reply(text, options);
        }
    }

    hasMedia(message) {
        return !!(message.photo || message.video || message.document || 
                 message.animation || message.voice || message.audio);
    }
}

module.exports = new FilterCommands();
