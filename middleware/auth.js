// ── Middleware kiểm tra đăng nhập & phân quyền ──────────────────

/** Yêu cầu đăng nhập — nếu chưa thì về /login kèm thông báo + returnTo */
function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }

  const message = encodeURIComponent('Vui lòng đăng nhập để sử dụng tính năng này');
  
  // Chỉ lưu URL chuyển hướng đối với phương thức GET
  const returnTo = req.method === 'GET' ? encodeURIComponent(req.originalUrl) : encodeURIComponent('/');
  
  return res.redirect(`/login?message=${message}&returnTo=${returnTo}`);
}

/** Yêu cầu quyền admin */
function requireAdmin(req, res, next) {
  // Nếu chưa đăng nhập -> chuyển hướng về trang login
  if (!req.session || !req.session.user) {
    const message = encodeURIComponent('Vui lòng đăng nhập tài khoản quản trị');
    const returnTo = req.method === 'GET' ? encodeURIComponent(req.originalUrl) : encodeURIComponent('/admin');
    return res.redirect(`/login?message=${message}&returnTo=${returnTo}`);
  }

  // Nếu đã đăng nhập nhưng không phải admin -> chặn truy cập (hoặc redirect về trang chủ)
  if (req.session.user.role !== 'admin') {
    return res.status(403).send('Truy cập bị từ chối: Bạn không có quyền truy cập trang này.');
    // Hoặc nếu muốn redirect về trang chủ:
    // return res.redirect('/?message=' + encodeURIComponent('Bạn không có quyền truy cập trang này.'));
  }

  next();
}

/** Nếu đã đăng nhập, không cho vào lại /login và /register */
function redirectIfLoggedIn(req, res, next) {
  if (req.session && req.session.user) {
    return req.session.user.role === 'admin' ? res.redirect('/admin') : res.redirect('/');
  }
  next();
}

module.exports = { 
  requireLogin, 
  requireAdmin, 
  redirectIfLoggedIn 
};
