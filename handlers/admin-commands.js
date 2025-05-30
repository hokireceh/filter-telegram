const config = require('../config/bot-config');
const database = require('../config/database');
const backupManager = require('../utils/backup-manager');
const fileManager = require('../utils/file-manager');
const logger = require('../utils/logger');

class AdminCommands {
    register(bot) {
        // Add admin command
        bot.command('addadmin', async (ctx) => {
            const args = ctx.message.text.split(' ');
            if (args.length < 2) {
                return ctx.reply(
                    '❌ Woy! Kasih ID Telegram yang mau dijadiin admin cok!\n\n' +
                    'Contoh: `/addadmin 123456789`\n' +
                    'Atau: `/addadmin @username`'
                );
            }

            let newAdminId = args[1].replace('@', '');
            
            // Jika username, coba dapatkan ID
            if (isNaN(newAdminId)) {
                return ctx.reply(
                    '❌ Anjir, kasih ID angka dong, bukan username!\n\n' +
                    'Cara dapet ID:\n' +
                    '1. Forward pesan dari orang itu ke @userinfobot\n' +
                    '2. Atau suruh dia kirim /start ke @userinfobot'
                );
            }

            if (config.admins.includes(newAdminId)) {
                return ctx.reply(`⚠️ Eh anjir, ${newAdminId} udah jadi admin dari dulu!`);
            }

            config.admins.push(newAdminId);
            
            // Update env file jika ada (opsional, untuk persistence)
            this.updateEnvFile();
            
            logger.info(`✅ Admin baru ditambahkan: ${newAdminId}`);
            ctx.reply(
                `✅ Mantap cok! ${newAdminId} udah jadi admin sekarang!\n\n` +
                `Sekarang dia bisa pake semua fitur bot ini. 🔥`
            );
        });

        // Remove admin command
        bot.command('removeadmin', async (ctx) => {
            const args = ctx.message.text.split(' ');
            if (args.length < 2) {
                return ctx.reply(
                    '❌ Kasih ID admin yang mau ditendang cok!\n\n' +
                    'Contoh: `/removeadmin 123456789`'
                );
            }

            const adminId = args[1].replace('@', '');
            const currentUserId = ctx.from.id.toString();
            
            // Jangan bisa remove diri sendiri jika admin terakhir
            if (adminId === currentUserId && config.admins.length === 1) {
                return ctx.reply(
                    '🚫 Anjir, lu admin terakhir! Gabisa remove diri sendiri cok!\n\n' +
                    'Tambah admin lain dulu, baru lu bisa keluar. 😤'
                );
            }

            const index = config.admins.indexOf(adminId);
            if (index === -1) {
                return ctx.reply(`⚠️ ${adminId} emang bukan admin anjir!`);
            }

            config.admins.splice(index, 1);
            this.updateEnvFile();
            
            logger.info(`🗑️ Admin dihapus: ${adminId}`);
            ctx.reply(
                `✅ ${adminId} udah ditendang dari admin!\n\n` +
                `Sekarang dia gabisa pake bot lagi. Bye bye! 👋`
            );
        });

        // List admins command
        bot.command('listadmins', async (ctx) => {
            if (config.admins.length === 0) {
                return ctx.reply('🤔 Aneh, kok gaada admin sama sekali?');
            }

            const adminList = config.admins.map((admin, index) => 
                `${index + 1}. ${admin}`
            ).join('\n');

            const statsText = 
                `👑 DAFTAR ADMIN ANJIR:\n\n` +
                `${adminList}\n\n` +
                `Total: ${config.admins.length} admin\n\n` +
                `ID lu: ${ctx.from.id}`;

            ctx.reply(statsText);
        });

        // Backup command
        bot.command('backup', async (ctx) => {
            try {
                ctx.reply('⏳ Sabar cok, lagi bikin backup...');
                
                const backupPath = await backupManager.createBackup('manual');
                if (backupPath) {
                    const backupStats = backupManager.getBackupStats();
                    ctx.reply(
                        `✅ Backup berhasil dibuat anjir!\n\n` +
                        `📁 File: ${backupPath.split('/').pop()}\n` +
                        `📊 Total backup: ${backupStats.count} file\n` +
                        `💾 Total size: ${backupStats.totalSizeMB} MB`
                    );
                } else {
                    ctx.reply('❌ Gagal bikin backup cok! Cek log buat detail.');
                }
            } catch (error) {
                logger.error('Error creating backup:', error);
                ctx.reply('❌ Error saat bikin backup anjir! Ada yang salah nih.');
            }
        });

        // Restore command
        bot.command('restore', async (ctx) => {
            const backups = backupManager.listBackups();
            if (backups.length === 0) {
                return ctx.reply('❌ Gaada backup yang bisa di-restore cok!');
            }

            // Show backup list dengan inline keyboard
            const keyboard = backups.slice(0, 10).map((backup, index) => [{
                text: `${index + 1}. ${backup.description} (${new Date(backup.created).toLocaleDateString('id-ID')})`,
                callback_data: `restore_${backup.name}`
            }]);

            keyboard.push([{ text: '❌ Batal', callback_data: 'restore_cancel' }]);

            ctx.reply(
                '🔄 PILIH BACKUP YANG MAU DI-RESTORE:\n\n' +
                'Hati-hati cok! Data sekarang bakal diganti sama backup yang dipilih!',
                {
                    reply_markup: { inline_keyboard: keyboard }
                }
            );
        });

        // Handle restore callback
        bot.action(/^restore_(.+)$/, async (ctx) => {
            const backupName = ctx.match[1];
            
            if (backupName === 'cancel') {
                return ctx.editMessageText('❌ Restore dibatalin cok!');
            }

            try {
                ctx.editMessageText('⏳ Lagi restore database... Jangan diapa-apain dulu!');
                
                const backupPath = require('path').join(config.backupDir, backupName);
                const success = await backupManager.restoreFromBackup(backupPath);
                
                if (success) {
                    // Reload database
                    database.load();
                    
                    ctx.editMessageText(
                        `✅ Restore berhasil anjir!\n\n` +
                        `📁 Dari backup: ${backupName}\n` +
                        `🔄 Database udah di-reload.\n\n` +
                        `Bot siap pakai lagi! 🚀`
                    );
                } else {
                    ctx.editMessageText('❌ Restore gagal cok! Cek log buat tau kenapa.');
                }
            } catch (error) {
                logger.error('Error during restore:', error);
                ctx.editMessageText('❌ Error saat restore anjir! Ada yang salah nih.');
            }
        });

        // Cleanup command
        bot.command('cleanup', async (ctx) => {
            try {
                ctx.reply('🧹 Mulai bersihin file sampah...');
                
                // Cleanup database references
                const dbCleanedCount = database.cleanupMedia();
                
                // Cleanup old files
                const fileCleanedCount = fileManager.cleanupOldFiles();
                
                // Get directory stats
                const dirStats = fileManager.getDirSize();
                
                ctx.reply(
                    `✅ Cleanup selesai anjir!\n\n` +
                    `🗑️ Database refs dihapus: ${dbCleanedCount}\n` +
                    `📁 File lama dihapus: ${fileCleanedCount}\n` +
                    `💾 Sisa file: ${dirStats.fileCount} (${dirStats.totalSizeMB} MB)\n\n` +
                    `Udah bersih sekarang! 🧽`
                );
                
            } catch (error) {
                logger.error('Error during cleanup:', error);
                ctx.reply('❌ Error saat cleanup cok! Ada yang salah.');
            }
        });
    }

    // Update environment file (opsional)
    updateEnvFile() {
        try {
            // Ini optional, untuk update .env file dengan admin terbaru
            // Implementasi tergantung kebutuhan
            logger.debug('Admin list updated in memory');
        } catch (error) {
            logger.error('Error updating env file:', error);
        }
    }
}

module.exports = new AdminCommands();
