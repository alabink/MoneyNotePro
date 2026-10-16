require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const connectDB = require('./config/db');
const { ensureSeedData } = require('./seed');

const authRoutes = require('./routes/authRoutes');
const incomeRoutes = require('./routes/incomeRoutes');
const goalRoutes = require('./routes/goalRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));

let isSeedChecked = false;
const ensureDbReady = async (req, res, next) => {
  try {
    await connectDB();
    if (!isSeedChecked) {
      isSeedChecked = true;
      await ensureSeedData(false);
    }
    next();
  } catch (error) {
    console.error('Database initialization error:', error.message);
    res.status(500).json({
      message:
        'Không thể kết nối cơ sở dữ liệu MongoDB. Vui lòng kiểm tra biến môi trường MONGO_URI trên Vercel.',
      error: error.message,
    });
  }
};

app.get('/api/health', ensureDbReady, (req, res) => {
  res.json({ status: 'ok', app: 'MoneyNote Pro', timestamp: new Date().toISOString() });
});

app.use('/api/auth', ensureDbReady, authRoutes);
app.use('/api/incomes', ensureDbReady, incomeRoutes);
app.use('/api/goals', ensureDbReady, goalRoutes);
app.use('/api/admin', ensureDbReady, adminRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const startServer = async () => {
  try {
    await connectDB();
    await ensureSeedData(false);
    isSeedChecked = true;

    app.listen(PORT, () => {
      console.log('==========================================================');
      console.log(`🚀 MoneyNote Pro Server đang chạy tại: http://localhost:${PORT}`);
      console.log('👑 Quản trị viên hệ thống: admin@moneynote.com / admin123');
      console.log('✨ Chế độ dữ liệu thật: Người dùng tự đăng ký và nhập dữ liệu');
      console.log('==========================================================');
    });
  } catch (error) {
    console.error('❌ Lỗi khởi động Server:', error.message);
    process.exit(1);
  }
};

if (require.main === module && !process.env.VERCEL) {
  startServer();
}

module.exports = app;
