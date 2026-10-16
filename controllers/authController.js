const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SystemAnnouncement = require('../models/SystemAnnouncement');
const { SystemSetting } = require('../models/SystemSetting');

const DEFAULT_USER_AVATAR = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

const signToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET || 'moneynote_pro_super_secret_jwt_key_2026',
    { expiresIn: '7d' }
  );
};

const sendTokenCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { fullName, email, password, avatar } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ Họ tên, Email và Mật khẩu.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu phải có tối thiểu 6 ký tự.',
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Email này đã được sử dụng. Vui lòng chọn email khác.',
      });
    }

    const defaultAvatar = avatar && avatar.trim() ? avatar.trim() : DEFAULT_USER_AVATAR;

    const user = await User.create({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password,
      avatar: defaultAvatar,
      role: 'user',
      status: 'active',
      lastLogin: new Date(),
    });

    const token = signToken(user);
    sendTokenCookie(res, token);

    const userObj = user.toObject();
    delete userObj.password;

    return res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công!',
      token,
      user: userObj,
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ khi đăng ký tài khoản.',
    });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ Email và Mật khẩu.',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không chính xác.',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không chính xác.',
      });
    }

    if (user.status === 'banned') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_BANNED',
        message: 'Tài khoản của bạn đã bị Quản trị viên khóa (Banned). Bạn không thể đăng nhập vào hệ thống!',
      });
    }

    // Tự động thay thế avatar cũ nếu đang dùng link lỗi dicebear
    if (!user.avatar || user.avatar.includes('dicebear.com')) {
      user.avatar =
        user.role === 'admin'
          ? 'https://cdn-icons-png.flaticon.com/512/2202/2202112.png'
          : DEFAULT_USER_AVATAR;
    }

    user.lastLogin = new Date();
    await user.save();

    const token = signToken(user);
    sendTokenCookie(res, token);

    const userObj = user.toObject();
    delete userObj.password;

    return res.json({
      success: true,
      message: 'Đăng nhập thành công!',
      token,
      user: userObj,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi đăng nhập.',
    });
  }
};

// POST /api/auth/logout
exports.logout = (req, res) => {
  res.clearCookie('token');
  return res.json({
    success: true,
    message: 'Đã đăng xuất khỏi hệ thống.',
  });
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (user && (!user.avatar || user.avatar.includes('dicebear.com'))) {
      user.avatar =
        user.role === 'admin'
          ? 'https://cdn-icons-png.flaticon.com/512/2202/2202112.png'
          : DEFAULT_USER_AVATAR;
      await user.save();
    }

    const announcements = await SystemAnnouncement.find({ isActive: true }).sort({ createdAt: -1 });
    const settings = await SystemSetting.getGlobalSettings();

    return res.json({
      success: true,
      user,
      announcements,
      categories: settings.categories,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Không thể tải thông tin người dùng.',
    });
  }
};

// PUT /api/auth/profile
exports.updateProfile = async (req, res) => {
  try {
    const { fullName, avatar } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
    }

    if (fullName && fullName.trim()) {
      user.fullName = fullName.trim();
    }
    if (avatar !== undefined && avatar.trim() !== '') {
      user.avatar = avatar.trim();
    }

    await user.save();
    const userObj = user.toObject();
    delete userObj.password;

    return res.json({
      success: true,
      message: 'Cập nhật hồ sơ cá nhân thành công!',
      user: userObj,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi khi cập nhật hồ sơ.',
    });
  }
};

// PUT /api/auth/change-password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu mới phải có ít nhất 6 ký tự.',
      });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu hiện tại không chính xác.',
      });
    }

    user.password = newPassword;
    await user.save();

    return res.json({
      success: true,
      message: 'Đổi mật khẩu thành công!',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi khi đổi mật khẩu.',
    });
  }
};
