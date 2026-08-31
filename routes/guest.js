const express = require('express');
const router  = express.Router();
const { db }  = require('../database/db');

// Gợi ý nhanh dùng chung dữ liệu bài hát với tìm kiếm trang chủ.
router.get('/api/search-suggestions', async (req, res, next) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  if (!query) return res.json({ suggestions: [] });

  try {
    const pattern = `%${query}%`;
    const prefixPattern = `${query}%`;
    const { rows } = await db.execute({
      sql: `
        SELECT id, title, artist, album, image,
          CASE
            WHEN title = ? OR artist = ? THEN 0
            WHEN title LIKE ? OR artist LIKE ? THEN 1
            WHEN title LIKE ? OR artist LIKE ? THEN 2
            WHEN album LIKE ? OR description LIKE ? THEN 3
            ELSE 4
          END AS relevance
        FROM music
        WHERE title LIKE ? OR artist LIKE ? OR album LIKE ? OR description LIKE ?
        ORDER BY relevance ASC, title COLLATE NOCASE ASC
        LIMIT 8
      `,
      args: [
        query, query,
        prefixPattern, prefixPattern,
        pattern, pattern,
        pattern, pattern,
        pattern, pattern, pattern, pattern
      ]
    });

    res.json({ suggestions: rows });
  } catch (err) {
    next(err);
  }
});

async function getAlbumSongs(albumId) {
  const { rows } = await db.execute(
    `SELECT m.* FROM album_songs a JOIN music m ON m.id = a.song_id
     WHERE a.album_id = ? ORDER BY a.position ASC, m.id ASC`, [albumId]
  );
  return rows;
}

router.get('/albums', async (req, res) => {
  const { rows: albums } = await db.execute(`
    SELECT a.*, COUNT(s.song_id) AS song_count
    FROM albums a LEFT JOIN album_songs s ON s.album_id = a.id
    GROUP BY a.id ORDER BY a.created_at DESC
  `);
  const { rows: settingsR } = await db.execute('SELECT * FROM settings WHERE id = 1');
  res.render('albums', { user: req.session.user, albums, settings: settingsR[0] || {} });
});

router.get('/albums/:id', async (req, res) => {
  const { rows } = await db.execute('SELECT * FROM albums WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.redirect('/albums');
  const { rows: settingsR } = await db.execute('SELECT * FROM settings WHERE id = 1');
  res.render('album_detail', {
    user: req.session.user, album: rows[0], songs: await getAlbumSongs(req.params.id),
    settings: settingsR[0] || {}
  });
});

// Trang chủ: cho phép xem & nghe nhạc mà không cần đăng nhập
router.get('/', async (req, res) => {
  const { q, sort } = req.query;

  let sql    = 'SELECT * FROM music';
  let params = [];

  if (q && q.trim()) {
    sql   += ' WHERE (title LIKE ? OR artist LIKE ?)';
    params = [`%${q.trim()}%`, `%${q.trim()}%`];
  }

  sql += sort === 'az' ? ' ORDER BY title ASC' : ' ORDER BY created_at DESC';

  const { rows: songs }    = await db.execute(sql, params);
  const { rows: settingsR } = await db.execute('SELECT * FROM settings WHERE id = 1');
  const settings = settingsR[0] || {};

  res.render('home', {
    user: req.session.user,
    songs,
    settings,
    q:    q    || '',
    sort: sort || 'newest'
  });
});

module.exports = router;
