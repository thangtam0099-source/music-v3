const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { db }  = require('../database/db');
const { redirectIfLoggedIn } = require('../middleware/auth');

// Helper lấy cài đặt hệ thống an toàn
async function getSettings() {
  try {
    const { rows } = await db.execute('SELECT * FROM settings WHERE id = 1');
    return rows && rows[0] ? rows[0] : {};
  } catch (err) {
    console.error('Error fetching settings:', err);
    return {};
  }
}

// Helper kiểm tra an toàn URL chuyển hướng (chống Open Redirect)
function getSafeRedirectUrl(returnTo) {
  if (typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    return returnTo;
  }
  return '/';
}

// ── GET /login ──────────────────────────────────
router.get('/login', redirectIfLoggedIn, async (req, res, next) => {
  try {
    const settings = await getSettings();
    const returnTo = getSafeRedirectUrl(req.query.returnTo);
    
    res.render('login', {
      error:    req.query.message || null,
      settings,
      returnTo
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /login ─────────────────────────────────
router.post('/login', redirectIfLoggedIn, async (req, res) => {
  const { username, password, returnTo } = req.body;
  const settings = await getSettings();
  const backTo   = getSafeRedirectUrl(returnTo);

  const cleanUsername = username ? username.trim() : '';

  if (!cleanUsername || !password) {
    return res.render('login', { 
      error: 'Vui lòng nhập đầy đủ thông tin.', 
      settings, 
      returnTo: backTo 
    });
  }

  try {
    const { rows } = await db.execute(
      'SELECT * FROM users WHERE username = ?', 
      [cleanUsername]
    );
    const user = rows && rows[0];

    // Tránh time-attack hoặc rò rỉ user bằng câu thông báo đồng nhất nếu cần
    if (!user) {
      return res.render('login', { 
        error: 'Tài khoản hoặc mật khẩu không chính xác.', 
        settings, 
        returnTo: backTo 
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render('login', { 
        error: 'Tài khoản hoặc mật khẩu không chính xác.', 
        settings, 
        returnTo: backTo 
      });
    }

    // Lưu thông tin user vào cookie-session
    req.session.user = {
      id:       Number(user.id),
      username: user.username,
      role:     user.role
    };

    if (user.role === 'admin') {
      return res.redirect('/admin');
    }
    return res.redirect(backTo);

  } catch (err) {
    console.error('Login error:', err);
    return res.render('login', {
      error: 'Đã có lỗi xảy ra trong quá trình đăng nhập. Vui lòng thử lại.',
      settings,
      returnTo: backTo
    });
  }
});

// ── GET /register ───────────────────────────────
router.get('/register', redirectIfLoggedIn, async (req, res, next) => {
  try {
    const settings = await getSettings();
    res.render('register', { error: null, success: null, settings });
  } catch (err) {
    next(err);
  }
});

// ── POST /register ──────────────────────────────
router.post('/register', redirectIfLoggedIn, async (req, res) => {
  const { username, password, confirm_password } = req.body;
  const settings = await getSettings();
  const fail = (msg) => res.render('register', { error: msg, success: null, settings });

  const cleanUsername = username ? username.trim() : '';

  if (!cleanUsername || !password) {
    return fail('Vui lòng nhập đầy đủ thông tin.');
  }
  if (cleanUsername.length < 3) {
    return fail('Username phải có ít nhất 3 ký tự (không tính khoảng trắng).');
  }
  if (password.length < 6) {
    return fail('Mật khẩu phải có ít nhất 6 ký tự.');
  }
  if (password !== confirm_password) {
    return fail('Mật khẩu xác nhận không khớp.');
  }

  try {
    const { rows } = await db.execute(
      'SELECT id FROM users WHERE username = ?', 
      [cleanUsername]
    );
    if (rows && rows.length > 0) {
      return fail('Username đã tồn tại.');
    }

    const hashed = await bcrypt.hash(password, 10);
    await db.execute(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      [cleanUsername, hashed, 'guest']
    );

    return res.render('register', {
      error: null,
      success: 'Đăng ký thành công! Bạn có thể đăng nhập.',
      settings
    });

  } catch (err) {
    console.error('Register error:', err);
    if (err.message && (err.message.includes('UNIQUE constraint') || err.message.includes('Duplicate entry'))) {
      return fail('Username đã tồn tại.');
    }
    return fail('Đã có lỗi xảy ra trong quá trình đăng ký. Vui lòng thử lại.');
  }
});

// ── GET /logout ─────────────────────────────────
router.get('/logout', (req, res) => {
  req.session = null; // Xóa cookie session hoàn toàn
  res.redirect('/login');
});

module.exports = router;
