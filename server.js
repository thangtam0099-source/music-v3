require('dotenv').config();

const express = require('express');
const cookieSession = require('cookie-session');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;
const secureSessionCookie = process.env.COOKIE_SECURE === 'true';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Giữ /uploads cho file local cũ
const uploadsDir = path.join(__dirname, 'uploads');
if (fs.existsSync(uploadsDir)) app.use('/uploads', express.static(uploadsDir));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(cookieSession({
  name:     'music-session',
  keys:     [process.env.SESSION_SECRET || 'music-player-secret'],
  maxAge:   7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure:   secureSessionCookie
}));

// ── Khởi tạo DB ──────────────────────────────────
// Trên serverless (Vercel), mỗi request có thể chạy trên một instance
// khác nhau nên KHÔNG được đăng ký route bên trong .then() — routes
// phải có sẵn ngay khi module được load. Việc khởi tạo DB chỉ chạy
// một lần (Promise được cache lại) và mọi request sẽ đợi nó xong.
const { initDB } = require('./database/db');

const dbReady = initDB().catch(err => {
  console.error('[FATAL] Không kết nối được DB:', err.message);
  throw err;
});

app.use((req, res, next) => {
  dbReady.then(() => next()).catch(next);
});

app.use('/',          require('./routes/auth'));
app.use('/',          require('./routes/guest'));
app.use('/admin',     require('./routes/admin'));
app.use('/playlists', require('./routes/playlist'));

app.use((req, res) =>
  res.status(404).send('<h2>404</h2><a href="/">Về trang chủ</a>')
);

app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(500).send('<h2>Lỗi server</h2><pre>' + err.message + '</pre>');
});

// Chạy local bằng `node server.js` / `npm start` thì mới tự listen.
// Trên Vercel, app được export ra và nền tảng tự gọi nó cho từng request.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🎵 Music Player: http://localhost:${PORT}`);
    console.log(`   Admin:         http://localhost:${PORT}/admin\n`);
  });
}

module.exports = app;
