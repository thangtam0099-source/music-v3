require('dotenv').config();

const express     = require('express');
const cookieSession = require('cookie-session');
const path        = require('path');
const fs          = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Giữ /uploads cho file local cũ nếu có
const uploadsDir = path.join(__dirname, 'uploads');
if (fs.existsSync(uploadsDir)) {
  app.use('/uploads', express.static(uploadsDir));
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Cookie Session ────────────────────────────────────
// Lưu session vào cookie mã hoá — stateless, hoạt động tốt trên Vercel Serverless
// Không dùng MemoryStore (mất session khi chuyển instance)
app.use(cookieSession({
  name:   'tamsession',
  keys:   [
    process.env.SESSION_SECRET || 'fallback-secret-key-change-this',
    process.env.SESSION_SECRET_2 || 'fallback-secret-key-2-change-this'
  ],
  // Cookie tồn tại 7 ngày
  maxAge: 7 * 24 * 60 * 60 * 1000,
  // Bảo mật
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production', // HTTPS only trên production
  sameSite: 'lax'
}));

// ── Tương thích với code cũ dùng req.session.user ────
// cookie-session lưu data trực tiếp trong req.session
// nên req.session.user vẫn hoạt động như cũ, không cần sửa routes
app.use((req, res, next) => {
  // Đảm bảo req.session luôn tồn tại
  if (!req.session) req.session = {};
  next();
});

// Khởi động DB trước rồi mới mount routes
const { initDB } = require('./database/db');

initDB()
  .then(() => {
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

    app.listen(PORT, () => {
      console.log(`\n🎵 Tâm Music: http://localhost:${PORT}`);
      console.log(`   Admin:     http://localhost:${PORT}/admin\n`);
    });
  })
  .catch(err => {
    console.error('[FATAL] Không kết nối được DB:', err.message);
    process.exit(1);
  });
