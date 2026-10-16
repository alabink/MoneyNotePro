const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Vui lòng nhập tên mục tiêu'],
      trim: true,
    },
    targetAmount: {
      type: Number,
      required: [true, 'Vui lòng nhập số tiền mục tiêu'],
      min: [1, 'Số tiền mục tiêu phải lớn hơn 0'],
    },
    // Số tiền đã làm được / Tiền tiết kiệm đang gửi (VD: 200.000.000 VNĐ)
    savingsPrincipal: {
      type: Number,
      default: 0,
      min: [0, 'Số tiền tiết kiệm không được âm'],
    },
    // Lãi suất (%) trên kỳ hạn gốc (VD: 8% trong 6 tháng -> 1.3333%/tháng)
    interestRate: {
      type: Number,
      default: 0,
      min: [0, 'Lãi suất không được âm'],
    },
    // Số tháng của kỳ hạn lãi suất chuẩn (VD: 6 tháng)
    interestTermMonths: {
      type: Number,
      default: 6,
      min: [1, 'Kỳ hạn tính lãi phải từ 1 tháng trở lên'],
    },
    startDate: {
      type: Date,
      required: [true, 'Vui lòng chọn ngày bắt đầu'],
    },
    endDate: {
      type: Date,
      required: [true, 'Vui lòng chọn ngày kết thúc'],
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'failed'],
      default: 'in_progress',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'goals',
  }
);

goalSchema.index({ userId: 1, isPinned: -1 });

module.exports = mongoose.model('Goal', goalSchema);
