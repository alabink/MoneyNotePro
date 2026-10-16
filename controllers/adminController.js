const User = require('../models/User');
const IncomeNote = require('../models/IncomeNote');
const Goal = require('../models/Goal');
const SystemAnnouncement = require('../models/SystemAnnouncement');
const { SystemSetting, DEFAULT_CATEGORIES } = require('../models/SystemSetting');

// 1. GET /api/admin/overview - Thống kê toàn hệ thống
exports.getSystemOverview = async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const startOfYear = new Date(year, 0, 1, 0, 0, 0, 0);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);

    const [
      totalUsers,
      activeUsers,
      bannedUsers,
      newUsersThisMonth,
      totalNotes,
      notesThisMonth,
      volumeAgg,
      monthVolumeAgg,
      totalGoals,
      completedGoals,
      usersInYear,
      notesInYear,
      categoryBreakdown,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'active' }),
      User.countDocuments({ status: 'banned' }),
      User.countDocuments({ createdAt: { $gte: startOfMonth } }),
      IncomeNote.countDocuments(),
      IncomeNote.countDocuments({ createdAt: { $gte: startOfMonth } }),
      IncomeNote.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
      IncomeNote.aggregate([
        { $match: { date: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Goal.countDocuments(),
      Goal.countDocuments({ status: 'completed' }),
      User.find({ createdAt: { $gte: startOfYear, $lte: endOfYear } })
        .select('createdAt')
        .lean(),
      IncomeNote.find({ date: { $gte: startOfYear, $lte: endOfYear } })
        .select('date amount')
        .lean(),
      IncomeNote.aggregate([
        {
          $group: {
            _id: '$category',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalAmount: -1 } },
      ]),
    ]);

    const totalVolume = volumeAgg.length > 0 ? volumeAgg[0].total : 0;
    const volumeThisMonth = monthVolumeAgg.length > 0 ? monthVolumeAgg[0].total : 0;

    // Biểu đồ tăng trưởng người dùng mới và tần suất hoạt động 12 tháng trong năm
    const monthlySeries = Array.from({ length: 12 }, (_, idx) => ({
      month: idx + 1,
      label: `Tháng ${idx + 1}`,
      newUsers: 0,
      notesCount: 0,
      volume: 0,
    }));

    for (const u of usersInYear) {
      const mIdx = new Date(u.createdAt).getMonth();
      if (monthlySeries[mIdx]) {
        monthlySeries[mIdx].newUsers += 1;
      }
    }

    for (const n of notesInYear) {
      const mIdx = new Date(n.date).getMonth();
      if (monthlySeries[mIdx]) {
        monthlySeries[mIdx].notesCount += 1;
        monthlySeries[mIdx].volume += n.amount;
      }
    }

    return res.json({
      success: true,
      year,
      stats: {
        totalUsers,
        activeUsers,
        bannedUsers,
        newUsersThisMonth,
        totalNotes,
        notesThisMonth,
        totalVolume,
        volumeThisMonth,
        totalGoals,
        completedGoals,
      },
      monthlySeries,
      categoryBreakdown: categoryBreakdown.map((item) => ({
        category: item._id || 'Khác',
        totalAmount: item.totalAmount,
        count: item.count,
      })),
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi tải thống kê toàn hệ thống.',
    });
  }
};

// 2. GET /api/admin/users - Danh sách tất cả User kèm thống kê tóm tắt
exports.getAllUsers = async (req, res) => {
  try {
    const { search, status, role } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }
    if (role && role !== 'all') {
      filter.role = role;
    }
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [{ fullName: regex }, { email: regex }];
    }

    const users = await User.find(filter).select('-password').sort({ createdAt: -1 }).lean();

    // Tính số bản ghi và tổng thu nhập đã nhập của từng User
    const incomeStats = await IncomeNote.aggregate([
      {
        $group: {
          _id: '$userId',
          notesCount: { $sum: 1 },
          totalIncome: { $sum: '$amount' },
        },
      },
    ]);

    const goalStats = await Goal.aggregate([
      {
        $group: {
          _id: '$userId',
          goalsCount: { $sum: 1 },
        },
      },
    ]);

    const incomeMap = {};
    for (const item of incomeStats) {
      incomeMap[String(item._id)] = {
        notesCount: item.notesCount,
        totalIncome: item.totalIncome,
      };
    }

    const goalMap = {};
    for (const g of goalStats) {
      goalMap[String(g._id)] = g.goalsCount;
    }

    const enrichedUsers = users.map((u) => {
      const stats = incomeMap[String(u._id)] || { notesCount: 0, totalIncome: 0 };
      return {
        ...u,
        notesCount: stats.notesCount,
        totalIncome: stats.totalIncome,
        goalsCount: goalMap[String(u._id)] || 0,
      };
    });

    return res.json({
      success: true,
      count: enrichedUsers.length,
      users: enrichedUsers,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Không thể tải danh sách người dùng.',
    });
  }
};

// PATCH /api/admin/users/:id/status - Khóa / Mở khóa tài khoản (Ban / Unban)
exports.toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (String(id) === String(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'Bạn không thể tự khóa tài khoản Quản trị viên của chính mình!',
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    const nextStatus = status && ['active', 'banned'].includes(status)
      ? status
      : user.status === 'active'
      ? 'banned'
      : 'active';

    user.status = nextStatus;
    await user.save();

    return res.json({
      success: true,
      message:
        nextStatus === 'banned'
          ? `Đã KHÓA (Ban) tài khoản "${user.email}".`
          : `Đã MỞ KHÓA (Unban) tài khoản "${user.email}".`,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        status: user.status,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi thay đổi trạng thái người dùng.',
    });
  }
};

// PATCH /api/admin/users/:id/role - Nâng cấp User lên Admin hoặc hạ quyền
exports.updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (String(id) === String(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'Bạn không thể tự hạ quyền Quản trị viên của chính mình!',
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    const nextRole = role && ['user', 'admin'].includes(role)
      ? role
      : user.role === 'admin'
      ? 'user'
      : 'admin';

    user.role = nextRole;
    await user.save();

    return res.json({
      success: true,
      message:
        nextRole === 'admin'
          ? `Đã nâng cấp "${user.email}" lên quyền Quản trị viên (ADMIN).`
          : `Đã chuyển "${user.email}" về quyền Người dùng (USER).`,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi cập nhật phân quyền người dùng.',
    });
  }
};

// POST /api/admin/users/:id/reset-password - Reset mật khẩu cho User
exports.resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    const passwordToSet = newPassword && newPassword.trim().length >= 6 ? newPassword.trim() : '123456';
    user.password = passwordToSet;
    await user.save();

    return res.json({
      success: true,
      message: `Đã đặt lại mật khẩu cho "${user.email}" thành: ${passwordToSet}`,
      tempPassword: passwordToSet,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi đặt lại mật khẩu người dùng.',
    });
  }
};

// DELETE /api/admin/users/:id - Xóa vĩnh viễn User và toàn bộ dữ liệu liên quan
exports.deleteUserPermanently = async (req, res) => {
  try {
    const { id } = req.params;

    if (String(id) === String(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'Không thể tự xóa tài khoản Quản trị viên đang đăng nhập!',
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    const [deletedNotes, deletedGoals] = await Promise.all([
      IncomeNote.deleteMany({ userId: user._id }),
      Goal.deleteMany({ userId: user._id }),
      User.findByIdAndDelete(user._id),
    ]);

    return res.json({
      success: true,
      message: `Đã xóa vĩnh viễn tài khoản "${user.email}" cùng ${deletedNotes.deletedCount} bản ghi thu nhập và ${deletedGoals.deletedCount} mục tiêu.`,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa người dùng.',
    });
  }
};

// 3. QUẢN LÝ THÔNG BÁO HỆ THỐNG (BROADCAST ANNOUNCEMENTS)
exports.getAnnouncements = async (req, res) => {
  try {
    const announcements = await SystemAnnouncement.find().sort({ createdAt: -1 });
    return res.json({
      success: true,
      announcements,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Không thể tải danh sách thông báo hệ thống.',
    });
  }
};

exports.createAnnouncement = async (req, res) => {
  try {
    const { title, content, isActive = true } = req.body;
    if (!title || !title.trim() || !content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ tiêu đề và nội dung thông báo.',
      });
    }

    const announcement = await SystemAnnouncement.create({
      title: title.trim(),
      content: content.trim(),
      isActive: Boolean(isActive),
    });

    return res.status(201).json({
      success: true,
      message: 'Đã phát thông báo hệ thống mới!',
      announcement,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi tạo thông báo hệ thống.',
    });
  }
};

exports.updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, isActive } = req.body;

    const announcement = await SystemAnnouncement.findById(id);
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo.' });
    }

    if (title !== undefined && title.trim()) announcement.title = title.trim();
    if (content !== undefined && content.trim()) announcement.content = content.trim();
    if (isActive !== undefined) announcement.isActive = Boolean(isActive);

    await announcement.save();

    return res.json({
      success: true,
      message: 'Đã cập nhật thông báo hệ thống!',
      announcement,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi cập nhật thông báo.',
    });
  }
};

exports.deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await SystemAnnouncement.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo cần xóa.' });
    }
    return res.json({
      success: true,
      message: 'Đã xóa thông báo hệ thống.',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa thông báo.',
    });
  }
};

// 4. QUẢN LÝ DANH MỤC MẶC ĐỊNH & SAO LƯU (SYSTEM SETTINGS)
exports.getSystemSettings = async (req, res) => {
  try {
    const settings = await SystemSetting.getGlobalSettings();
    return res.json({
      success: true,
      categories: settings.categories,
      updatedAt: settings.updatedAt,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Không thể tải cấu hình hệ thống.',
    });
  }
};

exports.updateSystemCategories = async (req, res) => {
  try {
    const { action, category, categories, name } = req.body;
    const settings = await SystemSetting.getGlobalSettings();

    if (action === 'reset') {
      settings.categories = DEFAULT_CATEGORIES;
    } else if (action === 'add' && category && category.name) {
      const cleanName = category.name.trim();
      const exists = settings.categories.some(
        (c) => c.name.toLowerCase() === cleanName.toLowerCase()
      );
      if (exists) {
        return res.status(400).json({
          success: false,
          message: `Danh mục "${cleanName}" đã tồn tại trong hệ thống.`,
        });
      }
      settings.categories.push({
        name: cleanName,
        color: category.color || '#6366f1',
        icon: category.icon || 'tag',
      });
    } else if (action === 'delete' && name) {
      settings.categories = settings.categories.filter(
        (c) => c.name.toLowerCase() !== name.trim().toLowerCase()
      );
    } else if (Array.isArray(categories) && categories.length > 0) {
      settings.categories = categories.map((c) => ({
        name: String(c.name).trim(),
        color: c.color || '#6366f1',
        icon: c.icon || 'tag',
      }));
    }

    settings.updatedAt = new Date();
    await settings.save();

    return res.json({
      success: true,
      message: 'Đã cập nhật danh mục mặc định của hệ thống!',
      categories: settings.categories,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi cập nhật danh mục mặc định.',
    });
  }
};

// GET /api/admin/export - Xuất báo cáo thống kê toàn hệ thống (JSON hoặc CSV)
exports.exportSystemReport = async (req, res) => {
  try {
    const { format = 'json' } = req.query;

    const [users, incomes, goals, announcements, settings] = await Promise.all([
      User.find().select('-password').sort({ createdAt: -1 }).lean(),
      IncomeNote.find().populate('userId', 'fullName email').sort({ date: -1 }).lean(),
      Goal.find().populate('userId', 'fullName email').sort({ createdAt: -1 }).lean(),
      SystemAnnouncement.find().sort({ createdAt: -1 }).lean(),
      SystemSetting.getGlobalSettings(),
    ]);

    const totalVolume = incomes.reduce((sum, item) => sum + item.amount, 0);

    if (format === 'csv') {
      const headers = [
        'STT',
        'Người dùng',
        'Email',
        'Ngày thu nhập',
        'Số tiền (VNĐ)',
        'Danh mục',
        'Ghi chú',
      ];
      const rows = incomes.map((inc, idx) => {
        const userName = inc.userId ? inc.userId.fullName : 'Đã xóa';
        const userEmail = inc.userId ? inc.userId.email : 'N/A';
        const dateStr = new Date(inc.date).toISOString().slice(0, 10);
        return [
          idx + 1,
          `"${String(userName).replace(/"/g, '""')}"`,
          `"${String(userEmail).replace(/"/g, '""')}"`,
          dateStr,
          inc.amount,
          `"${String(inc.category || '').replace(/"/g, '""')}"`,
          `"${String(inc.note || '').replace(/"/g, '""')}"`,
        ].join(',');
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="MoneyNotePro_SystemReport_${Date.now()}.csv"`);
      return res.send(csvContent);
    }

    const reportPayload = {
      exportedAt: new Date().toISOString(),
      systemSummary: {
        totalUsers: users.length,
        totalIncomeNotes: incomes.length,
        totalSystemVolumeVND: totalVolume,
        totalGoals: goals.length,
        totalAnnouncements: announcements.length,
      },
      categories: settings.categories,
      users,
      goals,
      announcements,
      incomes,
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="MoneyNotePro_Backup_${Date.now()}.json"`);
    return res.send(JSON.stringify(reportPayload, null, 2));
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xuất báo cáo hệ thống.',
    });
  }
};
