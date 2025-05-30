const config = require('../config/bot-config');
const logger = require('./logger');

class RateLimiter {
    constructor() {
        this.requests = new Map(); // userId -> { count, resetTime }
        this.globalStats = {
            totalRequests: 0,
            blockedRequests: 0,
            lastReset: Date.now()
        };
        
        // Cleanup expired entries setiap menit
        setInterval(() => this.cleanup(), 60000);
    }

    middleware = (ctx, next) => {
        const userId = ctx.from?.id;
        if (!userId) return next();

        const now = Date.now();
        const resetTime = now + 60000; // 1 menit dari sekarang
        
        this.globalStats.totalRequests++;

        // Get atau buat entry untuk user
        let userRequests = this.requests.get(userId);
        
        if (!userRequests || now > userRequests.resetTime) {
            // Reset counter jika sudah lewat 1 menit
            userRequests = { count: 0, resetTime };
            this.requests.set(userId, userRequests);
        }

        userRequests.count++;

        // Cek rate limit
        if (userRequests.count > config.rateLimitPerMinute) {
            this.globalStats.blockedRequests++;
            
            const firstName = ctx.from.first_name || 'Bro';
            const remainingTime = Math.ceil((userRequests.resetTime - now) / 1000);
            
            logger.warn(`🚫 Rate limit exceeded for user ${userId} (${firstName})`);
            
            ctx.reply(
                `🔥 Woy ${firstName}! Pelan-pelan anjir!\n\n` +
                `Lu udah kirim ${userRequests.count} pesan dalam 1 menit.\n` +
                `Tunggu ${remainingTime} detik lagi ya cok! 😤`
            ).catch(error => {
                logger.error('Error sending rate limit message:', error);
            });
            
            return; // Tidak lanjut ke handler berikutnya
        }

        // Warn jika mendekati limit
        if (userRequests.count === config.rateLimitPerMinute - 5) {
            const firstName = ctx.from.first_name || 'Bro';
            ctx.reply(
                `⚠️ Hati-hati ${firstName}!\n\n` +
                `Lu tinggal bisa kirim ${config.rateLimitPerMinute - userRequests.count} pesan lagi dalam 1 menit. ` +
                `Jangan spam ya anjir! 😅`
            ).catch(error => {
                logger.debug('Error sending rate limit warning:', error);
            });
        }

        return next();
    };

    cleanup() {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [userId, userRequests] of this.requests.entries()) {
            if (now > userRequests.resetTime) {
                this.requests.delete(userId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            logger.debug(`🧹 Rate limiter cleanup: removed ${cleanedCount} expired entries`);
        }
    }

    getStats() {
        const now = Date.now();
        const activeUsers = Array.from(this.requests.entries())
            .filter(([_, userRequests]) => now <= userRequests.resetTime)
            .length;

        return {
            ...this.globalStats,
            activeUsers,
            requestsPerMinute: this.calculateRequestsPerMinute(),
            lastReset: this.globalStats.lastReset
        };
    }

    calculateRequestsPerMinute() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        
        let recentRequests = 0;
        for (const [_, userRequests] of this.requests.entries()) {
            if (userRequests.resetTime > oneMinuteAgo) {
                recentRequests += userRequests.count;
            }
        }
        
        return recentRequests;
    }

    resetStats() {
        this.globalStats = {
            totalRequests: 0,
            blockedRequests: 0,
            lastReset: Date.now()
        };
        
        logger.info('📊 Rate limiter stats direset');
    }

    // Manual rate limit untuk fungsi tertentu
    checkCustomLimit(userId, identifier, limit, windowMs = 60000) {
        const key = `${userId}:${identifier}`;
        const now = Date.now();
        
        let entry = this.requests.get(key);
        if (!entry || now > entry.resetTime) {
            entry = { count: 0, resetTime: now + windowMs };
            this.requests.set(key, entry);
        }
        
        entry.count++;
        return entry.count <= limit;
    }
}

module.exports = new RateLimiter();
