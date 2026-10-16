const mongoose = require('mongoose');

const incomeNoteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Vui lòng nhập số tiền thu nhập'],
      min: [1, 'Số tiền phải lớn hơn 0'],
    },
    category: {
      type: String,
      required: true,
      default: 'Khác',
      trim: true,
    },
    note: {
      type: String,
      required: [true, 'Vui lòng nhập nội dung ghi chú'],
      trim: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'incomes',
  }
);

incomeNoteSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('IncomeNote', incomeNoteSchema);
