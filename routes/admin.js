const express = require('express');
const router  = express.Router();
const { db }  = require('../database/db');
const { requireAdmin }         = require('../middleware/auth');
const { deleteFromCloudinary } = require('../config/cloudinary');

// ── Xóa file trên Cloudinary ─────────────────────
function deleteFile(url) {
  if (url && url.includes('cloudinary.com'))
    deleteFromCloudinary(url).catch(() => {});
}

async function getSettings() {
  const { rows } = await db.execute('SELECT * FROM settings WHERE id = 1');
  return rows[0] || {};
}

function base(extra) {
  return {
    user: null, songs: [], editSong: null, settings: {},
    totalSongs: 0, totalUsers: 0, recentSongs: [],
    message: null, error: null,
    // Truyền Cloudinary config cho client-side upload
    cloudName:    process.env.CLOUDINARY_CLOUD_NAME    || '',
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
    ...extra
  };
}

// ── GET /admin ──────────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  const { rows: songs }  = await db.execute('SELECT COUNT(*) as c FROM music');
  const { rows: users }  = await db.execute('SELECT COUNT(*) as c FROM users');
  const { rows: recent } = await db.execute('SELECT * FROM music ORDER BY created_at DESC LIMIT 5');
  res.render('admin', base({
    user: req.session.user, page: 'dashboard', settings: await getSettings(),
    totalSongs: Number(songs[0].c), totalUsers: Number(users[0].c), recentSongs: recent
  }));
});

// ── GET /admin/songs ────────────────────────────
router.get('/songs', requireAdmin, async (req, res) => {
  const { rows: songs } = await db.execute('SELECT * FROM music ORDER BY created_at DESC');
  res.render('admin', base({
    user: req.session.user, page: 'songs', songs, settings: await getSettings(),
    message: req.query.message || null
  }));
});

// ── GET /admin/songs/edit/:id ───────────────────
router.get('/songs/edit/:id', requireAdmin, async (req, res) => {
  const { rows }         = await db.execute('SELECT * FROM music WHERE id = ?', [req.params.id]);
  const editSong         = rows[0];
  if (!editSong) return res.redirect('/admin/songs');
  const { rows: songs }  = await db.execute('SELECT * FROM music ORDER BY created_at DESC');
  res.render('admin', base({
    user: req.session.user, page: 'songs', songs, editSong, settings: await getSettings()
  }));
});

// ── POST /admin/songs/add ───────────────────────
// Nhận URL Cloudinary từ client (browser đã upload trực tiếp)
router.post('/songs/add', requireAdmin, async (req, res) => {
  const { title, artist, album, description, music_url, image_url } = req.body;

  if (!title || !artist)
    return res.redirect('/admin/songs?message=Thiếu tên bài hoặc ca sĩ');
  if (!music_url)
    return res.redirect('/admin/songs?message=Vui lòng upload file mp3');

  await db.execute(
    `INSERT INTO music (title, artist, album, description, image, music_file)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      title.trim(), artist.trim(),
      album?.trim()       || null,
      description?.trim() || null,
      image_url || null,
      music_url
    ]
  );
  res.redirect('/admin/songs?message=Đã thêm bài hát thành công!');
});

// ── POST /admin/songs/edit/:id ──────────────────
router.post('/songs/edit/:id', requireAdmin, async (req, res) => {
  const { rows } = await db.execute('SELECT * FROM music WHERE id = ?', [req.params.id]);
  const song = rows[0];
  if (!song) return res.redirect('/admin/songs');

  const { title, artist, album, description, music_url, image_url } = req.body;

  // Nếu có URL mới → xóa file cũ trên Cloudinary
  if (music_url && music_url !== song.music_file) deleteFile(song.music_file);
  if (image_url && image_url !== song.image)      deleteFile(song.image);

  await db.execute(
    `UPDATE music SET title=?, artist=?, album=?, description=?, image=?, music_file=? WHERE id=?`,
    [
      title?.trim()       || song.title,
      artist?.trim()      || song.artist,
      album?.trim()       || null,
      description?.trim() || null,
      image_url  || song.image,
      music_url  || song.music_file,
      req.params.id
    ]
  );
  res.redirect('/admin/songs?message=Đã cập nhật bài hát!');
});

// ── POST /admin/songs/delete/:id ────────────────
router.post('/songs/delete/:id', requireAdmin, async (req, res) => {
  const { rows } = await db.execute('SELECT * FROM music WHERE id = ?', [req.params.id]);
  if (rows[0]) {
    deleteFile(rows[0].music_file);
    deleteFile(rows[0].image);
    await db.execute('DELETE FROM music WHERE id = ?', [req.params.id]);
  }
  res.redirect('/admin/songs?message=Đã xóa bài hát!');
});

// ── GET /admin/settings ─────────────────────────
router.get('/settings', requireAdmin, async (req, res) => {
  res.render('admin', base({
    user: req.session.user, page: 'settings', settings: await getSettings(),
    message: req.query.message || null
  }));
});

// ── POST /admin/settings/update ─────────────────
// Nhận URL Cloudinary từ client cho logo/banner/background/login_background
router.post('/settings/update', requireAdmin, async (req, res) => {
  const allowed = ['logo', 'banner', 'background', 'login_background'];
  const settings = await getSettings();

  for (const type of allowed) {
    const url = req.body[type];
    if (url && url !== settings[type]) {
      if (settings[type]) deleteFile(settings[type]);
      await db.execute(`UPDATE settings SET ${type} = ? WHERE id = 1`, [url]);
    }
  }

  res.redirect('/admin/settings?message=Đã cập nhật giao diện thành công!');
});

module.exports = router;
