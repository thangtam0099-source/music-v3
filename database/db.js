const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

// ── Kết nối Turso ────────────────────────────────
// Nếu có TURSO_DATABASE_URL → dùng Turso cloud
// Nếu không (local dev)     → dùng SQLite file local
const isVercel = process.env.VERCEL === '1';
const isCloud = !!process.env.TURSO_DATABASE_URL;

if (isVercel && (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN)) {
  throw new Error('Thiếu TURSO_DATABASE_URL hoặc TURSO_AUTH_TOKEN trên Vercel');
}

const db = createClient(
  isCloud
    ? {
        url:       process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }
    : {
        url: 'file:database/database.db', // local SQLite file
      }
);

console.log(`[DB] Chế độ: ${isCloud ? '☁️  Turso Cloud' : '💾 SQLite Local'}`);

// ── Khởi tạo bảng ────────────────────────────────
async function initDB() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT    NOT NULL UNIQUE,
      password TEXT    NOT NULL,
      role     TEXT    NOT NULL DEFAULT 'guest'
    );

    CREATE TABLE IF NOT EXISTS music (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      artist      TEXT    NOT NULL,
      album       TEXT,
      description TEXT,
      image       TEXT,
      music_file  TEXT    NOT NULL,
      is_hot      INTEGER NOT NULL DEFAULT 0,
      hot_label   TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      name       TEXT    NOT NULL,
      song_ids   TEXT    NOT NULL DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS albums (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      description TEXT,
      thumbnail   TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS album_songs (
      album_id INTEGER NOT NULL,
      song_id  INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (album_id, song_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      id               INTEGER PRIMARY KEY CHECK (id = 1),
      logo             TEXT,
      banner           TEXT,
      background       TEXT,
      login_background TEXT,
      footer_title     TEXT,
      footer_text      TEXT,
      footer_copyright TEXT,
      facebook_url     TEXT,
      messenger_url    TEXT,
      zalo_url         TEXT
    );
  `);

  for (const column of [
    'footer_title', 'footer_text', 'footer_copyright',
    'facebook_url', 'messenger_url', 'zalo_url',
    'is_hot', 'hot_label'
  ]) {
    try {
      const isHotColumn = column === 'is_hot' ? 'INTEGER NOT NULL DEFAULT 0' : column === 'hot_label' ? 'TEXT' : 'TEXT';
      await db.execute(`ALTER TABLE music ADD COLUMN ${column} ${isHotColumn}`);
    } catch (err) {
      if (!err.message.includes('duplicate column name')) throw err;
    }
  }

  for (const column of [
    'footer_title', 'footer_text', 'footer_copyright',
    'facebook_url', 'messenger_url', 'zalo_url'
  ]) {
    try {
      await db.execute(`ALTER TABLE settings ADD COLUMN ${column} TEXT`);
    } catch (err) {
      if (!err.message.includes('duplicate column name')) throw err;
    }
  }

  // Settings mặc định
  await db.execute(`
    INSERT OR IGNORE INTO settings (id) VALUES (1)
  `);

  // Admin mặc định
  const { rows } = await db.execute(
    'SELECT id FROM users WHERE username = ?', ['admin']
  );
  if (rows.length === 0) {
    const hashed = await bcrypt.hash('admin123', 10);
    await db.execute(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      ['admin', hashed, 'admin']
    );
    console.log('[DB] Đã tạo tài khoản admin mặc định (admin/admin123)');
  }

  console.log('[DB] Khởi tạo xong ✓');
}

// ── Helper: parse song_ids JSON ───────────────────
function parseSongIds(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

module.exports = { db, initDB, parseSongIds };
