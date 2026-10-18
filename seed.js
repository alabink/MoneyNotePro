require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const IncomeNote = require('./models/IncomeNote');
const ExpenseNote = require('./models/ExpenseNote');
const Goal = require('./models/Goal');
const SystemAnnouncement = require('./models/SystemAnnouncement');
const { SystemSetting } = require('./models/SystemSetting');

const ADMIN_FLATICON_AVATAR = 'https://cdn-icons-png.flaticon.com/512/2202/2202112.png';
const USER_FLATICON_AVATAR = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

/**
 * Khởi tạo hệ thống sạch (Production Ready):
 * - Đảm bảo danh mục mặc định của hệ thống và tài khoản Quản trị viên gốc (admin@moneynote.com / admin123).
 * - Sử dụng Avatar mặc định từ Flaticon (https://www.flaticon.com/).
 */
async function ensureSeedData(cleanAllData = false) {
  try {
    if (cleanAllData) {
      await Promise.all([
        IncomeNote.deleteMany({}),
        ExpenseNote.deleteMany({}),
        Goal.deleteMany({}),
        SystemAnnouncement.deleteMany({}),
        User.deleteMany({ email: { $ne: 'admin@moneynote.com' } }),
      ]);
      console.log('🧹 Đã xóa toàn bộ dữ liệu mẫu. Hệ thống hiện chỉ lưu dữ liệu thật do người dùng nhập.');
    }

    await SystemSetting.getGlobalSettings();

    let adminUser = await User.findOne({ email: 'admin@moneynote.com' });
    if (!adminUser) {
      adminUser = await User.create({
        fullName: 'Quản Trị Viên',
        email: 'admin@moneynote.com',
        password: 'admin123',
        avatar: ADMIN_FLATICON_AVATAR,
        role: 'admin',
        status: 'active',
        streakCount: 0,
        lastEntryDate: null,
      });
      console.log('✅ Đã khởi tạo tài khoản Quản trị viên gốc: admin@moneynote.com / admin123');
    } else {
      if (!adminUser.avatar || adminUser.avatar.includes('dicebear.com')) {
        adminUser.avatar = ADMIN_FLATICON_AVATAR;
      }
      if (cleanAllData) {
        adminUser.streakCount = 0;
        adminUser.lastEntryDate = null;
      }
      await adminUser.save();
    }

    // Tự động chuyển đổi tất cả các tài khoản cũ còn lưu link dicebear sang icon Flaticon
    await User.updateMany(
      { avatar: { $regex: 'dicebear\\.com', $options: 'i' } },
      { $set: { avatar: USER_FLATICON_AVATAR } }
    );

    return { initialized: true };
  } catch (error) {
    console.error('❌ Lỗi khi khởi tạo cấu hình hệ thống:', error);
    throw error;
  }
}

if (require.main === module) {
  const connectDB = require('./config/db');
  connectDB().then(async () => {
    await ensureSeedData(true);
    await mongoose.connection.close();
    process.exit(0);
  });
}

module.exports = { ensureSeedData };
