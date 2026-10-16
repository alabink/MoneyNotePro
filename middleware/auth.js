const jwt = require('jsonwebtoken');
const User = require('../models/User');

const userAuthCache = global.__moneynote_user_cache || (global.__moneynote_user_cache = new Map());
const USER_CACHE_TTL_MS = 20000; // 20 giây

const invalidateUserCache = (userId) => {
  if (!userId) {
    userAuthCache.clear();
  } else {
    userAuthCache.delete(String(userId));
  }
};

/**
 * Middleware xác thực người dùng qua JWT (hỗ trợ cả HTTP-Only Cookie và Bearer Header + Cache tốc độ cao)
 */
const verifyToken = async (req, res, next) => {
  try {
    let token = null;

    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'moneynote_pro_super_secret_jwt_key_2026',
      { ignoreExpiration: true }
    );

    const cacheKey = String(decoded.id);
    const cachedEntry = userAuthCache.get(cacheKey);
    let user = null;

    if (cachedEntry && Date.now() - cachedEntry.at < USER_CACHE_TTL_MS) {
      user = cachedEntry.user;
    } else {
      user = await User.findById(decoded.id).select('-password').lean();
      if (user) {
        userAuthCache.set(cacheKey, { user, at: Date.now() });
      }
    }

    if (!user) {
      userAuthCache.delete(cacheKey);
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'Không tìm thấy tài khoản người dùng.',
      });
    }

    if (user.status === 'banned') {
      userAuthCache.delete(cacheKey);
      res.clearCookie('token');
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_BANNED',
        message: 'Tài khoản của bạn đã bị Quản trị viên khóa (Banned). Vui lòng liên hệ Admin để được hỗ trợ.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      code: 'INVALID_TOKEN',
      message: 'Token không hợp lệ.',
    });
  }
};

/**
 * Middleware kiểm tra quyền Quản trị viên (Admin)
 */
const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Truy cập bị từ chối! Chức năng này chỉ dành cho Quản trị viên (Admin).',
    });
  }
  next();
};

module.exports = {
  verifyToken,
  isAdmin,
  invalidateUserCache,
};
