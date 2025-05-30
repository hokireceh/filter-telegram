const config = require('../config/bot-config');
const logger = require('../utils/logger');

// Middleware untuk cek admin dan filter pesan
const adminCheck = (ctx, next) => {
    // Skip jika bukan pesan text atau command
    if (!ctx.message && !ctx.callbackQuery) {
        return next();
    }

    const userId = ctx.from?.id?.toString();
    if (!userId) {
        logger.warn('⚠️ Received message without user ID');
        return;
    }

    const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
    const isPrivate = ctx.chat?.type === 'private';
    const firstName = ctx.from.first_name || 'User';

    // Log aktivitas user
    logger.debug(`📨 Message from ${firstName} (${userId}) in ${isGroup ? 'group' : 'private'}`);

    // Command /start bisa dipakai semua orang
    if (ctx.message?.text === '/start') {
        return next();
    }

    // Cek apakah user adalah admin
    const isAdmin = config.admins.includes(userId);

    if (isGroup) {
        // Di grup, hanya admin yang bisa pakai bot
        if (isAdmin) {
            return next();
        } else {
            // Ignore pesan dari non-admin di grup (diam aja)
            logger.debug(`🔕 Ignoring message from non-admin ${firstName} in group`);
            return;
        }
    } else if (isPrivate) {
        // Di chat pribadi, cek admin
        if (isAdmin) {
            return next();
        } else {
            // Non-admin di private chat
            logger.info(`🚫 Non-admin ${firstName} (${userId}) tried to use bot in private`);
            
            ctx.reply(
                `🚫 Woy ${firstName}!\n\n` +
                `Bot ini khusus admin doang cok, lu gabisa pake.\n` +
                `Kalo mau jadi admin, hubungi boss gue ya! 😎\n\n` +
                `_Jangan spam ya anjir, nanti gue block!_ 🔨`
            ).catch(error => {
                logger.error('Error sending access denied message:', error);
            });
            
            return;
        }
    }

    // Default: lanjutkan jika kondisi lain
    return next();
};

module.exports = adminCheck;
