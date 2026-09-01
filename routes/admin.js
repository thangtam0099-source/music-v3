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
    user: null, songs: [], albums: [], editSong: null, editAlbum: null, settings: {},
    totalSongs: 0, totalUsers: 0, recentSongs: [],
    message: null, error: null,
    // Truyền Cloudinary config cho client-side upload
    cloudName:    process.env.CLOUDINARY_CLOUD_NAME    || '',
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
    ...extra
  };
}

async function getAlbumSongs(albumId) {
  const { rows } = await db.execute(
    `SELECT m.* FROM album_songs a JOIN music m ON m.id = a.song_id
     WHERE a.album_id = ? ORDER BY a.position ASC, m.id ASC`, [albumId]
  );
  return rows;
}

async function getAlbumRows() {
  const { rows: albums } = await db.execute('SELECT * FROM albums ORDER BY created_at DESC');
  const { rows: links } = await db.execute('SELECT album_id, COUNT(*) AS song_count FROM album_songs GROUP BY album_id');
  return albums.map(album => ({
    ...album,
    songCount: Number(links.find(link => Number(link.album_id) === Number(album.id))?.song_count || 0)
  }));
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

router.get('/albums', requireAdmin, async (req, res) => {
  const { rows: songs } = await db.execute('SELECT * FROM music ORDER BY title COLLATE NOCASE ASC');
  res.render('admin', base({
    user: req.session.user, page: 'albums', songs, albums: await getAlbumRows(),
    settings: await getSettings(), message: req.query.message || null
  }));
});

router.get('/albums/edit/:id', requireAdmin, async (req, res) => {
  const { rows } = await db.execute('SELECT * FROM albums WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.redirect('/admin/albums');
  const { rows: songs } = await db.execute('SELECT * FROM music ORDER BY title COLLATE NOCASE ASC');
  const albumSongs = await getAlbumSongs(req.params.id);
  res.render('admin', base({
    user: req.session.user, page: 'albums', songs, albums: await getAlbumRows(),
    editAlbum: { ...rows[0], songIds: albumSongs.map(song => Number(song.id)) },
    settings: await getSettings()
  }));
});

async function saveAlbumSongs(albumId, songIds) {
  await db.execute('DELETE FROM album_songs WHERE album_id = ?', [albumId]);
  const ids = (Array.isArray(songIds) ? songIds : songIds ? [songIds] : [])
    .map(id => parseInt(id, 10)).filter(Number.isInteger);
  for (let position = 0; position < ids.length; position++) {
    await db.execute(
      'INSERT OR IGNORE INTO album_songs (album_id, song_id, position) VALUES (?, ?, ?)',
      [albumId, ids[position], position]
    );
  }
}

router.post('/albums/add', requireAdmin, async (req, res) => {
  const { name, description, thumbnail_url, songIds } = req.body;
  if (!name?.trim()) return res.redirect('/admin/albums?message=Tên album không được để trống');
  const result = await db.execute(
    'INSERT INTO albums (name, description, thumbnail) VALUES (?, ?, ?)',
    [name.trim(), description?.trim() || null, thumbnail_url || null]
  );
  await saveAlbumSongs(result.lastInsertRowid, songIds);
  res.redirect('/admin/albums?message=Đã thêm album thành công!');
});

router.post('/albums/edit/:id', requireAdmin, async (req, res) => {
  const { rows } = await db.execute('SELECT * FROM albums WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.redirect('/admin/albums');
  const { name, description, thumbnail_url, songIds } = req.body;
  if (!name?.trim()) return res.redirect(`/admin/albums/edit/${req.params.id}?message=Tên album không được để trống`);
  if (thumbnail_url && thumbnail_url !== rows[0].thumbnail) deleteFile(rows[0].thumbnail);
  await db.execute(
    'UPDATE albums SET name = ?, description = ?, thumbnail = ? WHERE id = ?',
    [name.trim(), description?.trim() || null, thumbnail_url || rows[0].thumbnail, req.params.id]
  );
  await saveAlbumSongs(req.params.id, songIds);
  res.redirect('/admin/albums?message=Đã cập nhật album!');
});

router.post('/albums/delete/:id', requireAdmin, async (req, res) => {
  const { rows } = await db.execute('SELECT * FROM albums WHERE id = ?', [req.params.id]);
  if (rows[0]) {
    deleteFile(rows[0].thumbnail);
    await db.execute('DELETE FROM album_songs WHERE album_id = ?', [req.params.id]);
    await db.execute('DELETE FROM albums WHERE id = ?', [req.params.id]);
  }
  res.redirect('/admin/albums?message=Đã xóa album!');
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
  const { title, artist, album, description, music_url, image_url, is_hot, hot_label } = req.body;

  if (!title || !artist)
    return res.redirect('/admin/songs?message=Thiếu tên bài hoặc ca sĩ');
  if (!music_url)
    return res.redirect('/admin/songs?message=Vui lòng upload file mp3');

  const hotFlag = is_hot === 'on' || is_hot === '1' || is_hot === true ? 1 : 0;
  const label = hotFlag ? (hot_label?.trim() || 'HOT') : null;

  await db.execute(
    `INSERT INTO music (title, artist, album, description, image, music_file, is_hot, hot_label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title.trim(), artist.trim(),
      album?.trim()       || null,
      description?.trim() || null,
      image_url || null,
      music_url,
      hotFlag,
      label
    ]
  );
  res.redirect('/admin/songs?message=Đã thêm bài hát thành công!');
});

// ── POST /admin/songs/edit/:id ──────────────────
router.post('/songs/edit/:id', requireAdmin, async (req, res) => {
  const { rows } = await db.execute('SELECT * FROM music WHERE id = ?', [req.params.id]);
  const song = rows[0];
  if (!song) return res.redirect('/admin/songs');

  const { title, artist, album, description, music_url, image_url, is_hot, hot_label } = req.body;

  // Nếu có URL mới → xóa file cũ trên Cloudinary
  if (music_url && music_url !== song.music_file) deleteFile(song.music_file);
  if (image_url && image_url !== song.image)      deleteFile(song.image);

  const hotFlag = is_hot === 'on' || is_hot === '1' || is_hot === true ? 1 : 0;
  const label = hotFlag ? (hot_label?.trim() || 'HOT') : null;

  await db.execute(
    `UPDATE music SET title=?, artist=?, album=?, description=?, image=?, music_file=?, is_hot=?, hot_label=? WHERE id=?`,
    [
      title?.trim()       || song.title,
      artist?.trim()      || song.artist,
      album?.trim()       || null,
      description?.trim() || null,
      image_url  || song.image,
      music_url  || song.music_file,
      hotFlag,
      label,
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
// Nhận URL Cloudinary và nội dung footer từ form cài đặt
router.post('/settings/update', requireAdmin, async (req, res) => {
  const allowed = ['logo', 'banner', 'background', 'login_background'];
  const socialFields = ['facebook_url', 'messenger_url', 'zalo_url'];
  const settings = await getSettings();

  for (const type of allowed) {
    const url = req.body[type];
    if (url && url !== settings[type]) {
      if (settings[type]) deleteFile(settings[type]);
      await db.execute(`UPDATE settings SET ${type} = ? WHERE id = 1`, [url]);
    }
  }

  const footerFields = ['footer_title', 'footer_text', 'footer_copyright'];
  for (const field of footerFields) {
    const value = typeof req.body[field] === 'string' ? req.body[field].trim() : '';
    await db.execute(`UPDATE settings SET ${field} = ? WHERE id = 1`, [value || null]);
  }

  for (const field of socialFields) {
    const value = typeof req.body[field] === 'string' ? req.body[field].trim() : '';
    if (value) {
      try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
      } catch {
        return res.redirect('/admin/settings?message=Liên kết mạng xã hội phải bắt đầu bằng http:// hoặc https://');
      }
    }
    await db.execute(`UPDATE settings SET ${field} = ? WHERE id = 1`, [value || null]);
  }

  res.redirect('/admin/settings?message=Đã cập nhật giao diện thành công!');
});

module.exports = router;
