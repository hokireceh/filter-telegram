// Bot Telegram dengan Multi-Admin, Penyimpanan File, dan Sistem Filter
const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Konfigurasi bot
const config = {
  token: process.env.BOT_TOKEN,
  admins: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [], // ID Admin Telegram
  dataDir: './data',
  mediaDir: './media',
  dbFile: './data/database.json'
};

// Buat direktori yang diperlukan
if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

if (!fs.existsSync(config.mediaDir)) {
  fs.mkdirSync(config.mediaDir, { recursive: true });
}

// Inisialisasi atau muat database
let db = {
  filters: {},
  adminCommands: {},
  media: {}
};

if (fs.existsSync(config.dbFile)) {
  try {
    const data = fs.readFileSync(config.dbFile, 'utf8');
    db = JSON.parse(data);
  } catch (error) {
    console.error('Error saat memuat database:', error);
  }
}

// Fungsi menyimpan database
function simpanDatabase() {
  try {
    fs.writeFileSync(config.dbFile, JSON.stringify(db, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saat menyimpan database:', error);
  }
}

// Inisialisasi bot
const bot = new Telegraf(config.token);

// Middleware untuk memeriksa apakah pengguna adalah admin
const isAdmin = (ctx, next) => {
  const userId = ctx.from.id.toString();
  if (config.admins.includes(userId)) {
    return next();
  }
  return ctx.reply('🚫 Anda tidak memiliki izin untuk menggunakan perintah ini.');
};

// Fungsi bantuan untuk mengunduh file media
async function unduhFile(fileUrl, filePath) {
  const writer = fs.createWriteStream(filePath);

  const response = await axios({
    url: fileUrl,
    method: 'GET',
    responseType: 'stream'
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// Fungsi bantuan untuk mengekstrak media dari pesan
async function ekstrakMediaDariPesan(ctx) {
  let mediaObj = null;
  let mediaId = null;
  let fileType = null;
  let fileUrl = null;

  // Periksa berbagai jenis media
  if (ctx.message.photo) {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    mediaObj = photo;
    mediaId = photo.file_id;
    fileType = 'photo';
  } else if (ctx.message.video) {
    mediaObj = ctx.message.video;
    mediaId = ctx.message.video.file_id;
    fileType = 'video';
  } else if (ctx.message.document) {
    mediaObj = ctx.message.document;
    mediaId = ctx.message.document.file_id;
    fileType = 'document';
  } else if (ctx.message.animation) {
    mediaObj = ctx.message.animation;
    mediaId = ctx.message.animation.file_id;
    fileType = 'animation';
  } else if (ctx.message.voice) {
    mediaObj = ctx.message.voice;
    mediaId = ctx.message.voice.file_id;
    fileType = 'voice';
  } else if (ctx.message.audio) {
    mediaObj = ctx.message.audio;
    mediaId = ctx.message.audio.file_id;
    fileType = 'audio';
  }

  if (mediaId) {
    // Dapatkan jalur file
    const fileInfo = await ctx.telegram.getFile(mediaId);
    fileUrl = `https://api.telegram.org/file/bot${config.token}/${fileInfo.file_path}`;

    // Buat nama file unik
    const uuid = uuidv4();
    const ext = path.extname(fileInfo.file_path) || '';
    const fileName = `${uuid}${ext}`;
    const filePath = path.join(config.mediaDir, fileName);

    // Unduh file
    await unduhFile(fileUrl, filePath);

    return {
      type: fileType,
      fileId: mediaId,
      localPath: filePath,
      originalName: mediaObj.file_name || `${fileType}${ext}`,
      uuid: uuid
    };
  }

  return null;
}

// Fungsi pembantu untuk escape karakter khusus di MarkdownV2
function escapeMarkdown(text) {
  return text.replace(/[-_.!()]/g, '\\$&');
}

// Tambahkan middleware untuk pengecekan pesan
bot.use((ctx, next) => {
  // Izinkan perintah /start untuk semua pengguna
  if (ctx.message && ctx.message.text === '/start') {
    return next();
  }

  const userId = ctx.from.id.toString();
  const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

  // Jika di grup, hanya respon ke admin bot
  if (isGroup) {
    if (config.admins.includes(userId)) {
      return next();
    }
    // Jika bukan admin, abaikan pesan (diam)
    return;
  }

  // Jika chat pribadi, verifikasi admin
  if (config.admins.includes(userId)) {
    return next();
  }

  return ctx.reply('🚫 Maaf, hanya admin yang dapat menggunakan bot ini.');
});

// Perintah start - dapat digunakan semua pengguna
bot.start(ctx => {
  const userId = ctx.from.id.toString();
  if (config.admins.includes(userId)) {
    ctx.reply('👋 Selamat datang, Admin! Gunakan /help untuk melihat perintah yang tersedia.');
  } else {
    ctx.reply('👋 Selamat datang! Bot ini hanya dapat digunakan oleh admin.');
  }
});

// Perintah bantuan (hanya admin - sudah difilter oleh middleware)
bot.command('help', ctx => {
  try {
    const helpText = 
      '🔹 *Perintah Admin:*\n\n' +
      '• `/addadmin @username` \\- Tambah admin baru\n' +
      '• `/removeadmin @username` \\- Hapus admin\n' +
      '• `/listadmins` \\- Daftar semua admin\n\n' +
      '🔹 *Perintah Filter:*\n\n' +
      '• `\\!add kata\\_kunci` \\- Tambah atau update filter\n' +
      '• `\\!del kata\\_kunci` \\- Hapus filter\n' +
      '• `\\!list` \\- Lihat daftar semua filter\n' +
      '• `\\!kata\\_kunci` \\- Jalankan filter\n\n' +
      'Untuk menambahkan filter dengan media, gunakan `\\!add kata\\_kunci` dan balas ke pesan dengan teks dan/atau media\\.';

    ctx.reply(helpText, { parse_mode: 'MarkdownV2' });
  } catch (error) {
    console.error('Error saat mengirim pesan help:', error);
    ctx.reply('Terjadi kesalahan saat mengirim pesan bantuan.');
  }
});

// Perintah admin
bot.command('addadmin', ctx => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('❌ Mohon berikan ID pengguna Telegram untuk ditambahkan sebagai admin.');
  }

  const newAdminId = args[1].replace('@', '');

  if (!config.admins.includes(newAdminId)) {
    config.admins.push(newAdminId);
    ctx.reply(`✅ Berhasil menambahkan ${newAdminId} ke daftar admin.`);
  } else {
    ctx.reply('⚠️ Pengguna ini sudah menjadi admin.');
  }
});

bot.command('removeadmin', ctx => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('❌ Mohon berikan ID pengguna Telegram untuk dihapus dari admin.');
  }

  const adminId = args[1].replace('@', '');
  const index = config.admins.indexOf(adminId);

  if (index !== -1) {
    config.admins.splice(index, 1);
    ctx.reply(`✅ Berhasil menghapus ${adminId} dari daftar admin.`);
  } else {
    ctx.reply('⚠️ Pengguna ini bukan admin.');
  }
});

bot.command('listadmins', ctx => {
  try {
    const escapedAdminList = config.admins.map(admin => `• ${escapeMarkdown(admin)}`).join('\n');
    ctx.reply(`📋 *Daftar Admin:*\n\n${escapedAdminList}`, { parse_mode: 'MarkdownV2' });
  } catch (error) {
    console.error('Error saat mengirim daftar admin:', error);
    ctx.reply('Terjadi kesalahan saat mengirim daftar admin.');
  }
});

// Perintah filter
bot.hears(/^!add (.+)$|^!a (.+)$/, async (ctx) => {
  const keyword = (ctx.match[1] || ctx.match[2]).trim();
  // Delete command message after 3 seconds
  setTimeout(() => {
    ctx.deleteMessage(ctx.message.message_id).catch(console.error);
  }, 3000);

  // Cek apakah ini adalah balasan ke pesan lain
  if (!ctx.message.reply_to_message) {
    return ctx.reply('❌ Mohon balas ke pesan yang berisi konten untuk filter ini.');
  }

  const replyMsg = ctx.message.reply_to_message;
  const content = {
    text: replyMsg.text || replyMsg.caption || '',
    entities: replyMsg.entities || replyMsg.caption_entities || [],
    media: []
  };

  // Cek apakah ada media dalam balasan
  if (replyMsg.photo || replyMsg.video || replyMsg.document || 
      replyMsg.animation || replyMsg.voice || replyMsg.audio) {
    try {
      const mediaInfo = await ekstrakMediaDariPesan(replyMsg);
      if (mediaInfo) {
        content.media.push(mediaInfo);
        db.media[mediaInfo.uuid] = mediaInfo;
      }
    } catch (error) {
      console.error('Error memproses media:', error);
      ctx.reply('⚠️ Error saat memproses media.');
    }
  }

  // Simpan filter
  db.filters[keyword] = content;
  simpanDatabase();

  ctx.reply(`✅ Filter "${keyword}" telah ${db.filters[keyword] ? 'diperbarui' : 'ditambahkan'}.`);
});

// Menyimpan status konfirmasi penghapusan
const deleteConfirmations = new Map();

bot.hears(/^!del (.+)$|^!d (.+)$/, async (ctx) => {
  const keyword = (ctx.match[1] || ctx.match[2]).trim();
  const msgId = ctx.message.message_id;

  if (db.filters[keyword]) {
    // Kirim pesan konfirmasi dengan tombol
    const confirmMessage = await ctx.reply(`⚠️ Anda yakin ingin menghapus filter "${keyword}"?`, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Setuju', callback_data: `del_confirm_${keyword}_${msgId}` },
          { text: '❌ Batalkan', callback_data: `del_cancel_${keyword}_${msgId}` }
        ]]
      }
    });

    // Hapus pesan konfirmasi setelah 30 detik
    setTimeout(async () => {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, confirmMessage.message_id);
        await ctx.deleteMessage(msgId);
      } catch (error) {
        console.error('Error menghapus pesan konfirmasi:', error);
      }
    }, 30000);
  } else {
    ctx.reply(`⚠️ Filter "${keyword}" tidak ditemukan.`);
  }
});

// Handler untuk tombol konfirmasi
bot.action(/^del_confirm_(.+)_(\d+)$/, async (ctx) => {
  const [keyword, originalMsgId] = ctx.match[1].split('_');

  if (db.filters[keyword]) {
    // Hapus file media terkait
    if (db.filters[keyword].media && db.filters[keyword].media.length > 0) {
      for (const media of db.filters[keyword].media) {
        try {
          if (fs.existsSync(media.localPath)) {
            fs.unlinkSync(media.localPath);
          }
          // Hapus dari database media
          if (db.media[media.uuid]) {
            delete db.media[media.uuid];
          }
        } catch (error) {
          console.error(`Error menghapus file media: ${error}`);
        }
      }
    }

    // Hapus filter
    delete db.filters[keyword];
    simpanDatabase();

    // Update pesan konfirmasi
    await ctx.editMessageText(`✅ Filter "${keyword}" telah dihapus.`);

    // Hapus pesan original setelah 3 detik
    setTimeout(async () => {
      try {
        await ctx.deleteMessage();
        await ctx.telegram.deleteMessage(ctx.chat.id, originalMsgId);
      } catch (error) {
        console.error('Error menghapus pesan:', error);
      }
    }, 3000);
  }
});

// Handler untuk tombol batalkan
bot.action(/^del_cancel_(.+)_(\d+)$/, async (ctx) => {
  const [keyword, originalMsgId] = ctx.match[1].split('_');

  // Update pesan konfirmasi
  await ctx.editMessageText(`❌ Penghapusan filter "${keyword}" dibatalkan.`);

  // Hapus pesan setelah 3 detik
  setTimeout(async () => {
    try {
      await ctx.deleteMessage();
      await ctx.telegram.deleteMessage(ctx.chat.id, originalMsgId);
    } catch (error) {
      console.error('Error menghapus pesan:', error);
    }
  }, 3000);
});

bot.hears(/^!list$|^!l$/, async (ctx) => {
  // Delete command message after 3 seconds
  setTimeout(() => {
    ctx.deleteMessage(ctx.message.message_id).catch(console.error);
  }, 3000);
  try {
    const keywords = Object.keys(db.filters);

    if (keywords.length === 0) {
      return ctx.reply('📝 Tidak ada filter tersedia.');
    }

    const escapedFilterList = keywords.map(keyword => `• \\!${escapeMarkdown(keyword)}`).join('\n');
    ctx.reply(`📋 *Filter Tersedia:*\n\n${escapedFilterList}`, { parse_mode: 'MarkdownV2' });
  } catch (error) {
    console.error('Error saat mengirim daftar filter:', error);
    ctx.reply('Terjadi kesalahan saat mengirim daftar filter.');
  }
});

// Menangani trigger filter
bot.hears(/^!(.+)$/, async (ctx) => {
  const keyword = ctx.match[1].trim();

  if (db.filters[keyword]) {
    const filter = db.filters[keyword];

    // Jika ada media, kirimkan
    if (filter.media && filter.media.length > 0) {
      for (const media of filter.media) {
        try {
          if (!fs.existsSync(media.localPath)) {
            continue;
          }

          // Kirim media dengan caption teks asli jika ada
          let options = {};
          if (filter.text) {
            options = { caption: filter.text };
          }

          switch (media.type) {
            case 'photo':
              await ctx.replyWithPhoto({ source: media.localPath }, options);
              break;
            case 'video':
              await ctx.replyWithVideo({ source: media.localPath }, options);
              break;
            case 'document':
              await ctx.replyWithDocument({ source: media.localPath }, options);
              break;
            case 'animation':
              await ctx.replyWithAnimation({ source: media.localPath }, options);
              break;
            case 'voice':
              await ctx.replyWithVoice({ source: media.localPath }, options);
              break;
            case 'audio':
              await ctx.replyWithAudio({ source: media.localPath }, options);
              break;
          }
        } catch (error) {
          console.error(`Error mengirim media: ${error}`);
          ctx.reply('⚠️ Error saat mengirim media.');
        }
      }
    } else if (filter.text) {
      // Kirim pesan dengan mempertahankan format asli
      await ctx.telegram.sendMessage(ctx.chat.id, filter.text, {
        entities: filter.entities,
        disable_web_page_preview: true
      });
    }
  }
});

// Penanganan error
bot.catch((err, ctx) => {
  console.error(`Error bot: ${err}`);
  ctx.reply('⚠️ Terjadi kesalahan saat memproses permintaan Anda.');
});

// Jalankan bot
bot.launch().then(() => {
  console.log('Bot telah dimulai');
}).catch(err => {
  console.error('Error saat memulai bot:', err);
});

// Aktifkan penghentian yang aman
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
