const mongoose = require('mongoose');

const expenseNoteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Vui lòng nhập số tiền chi tiêu'],
      min: [1, 'Số tiền chi tiêu phải lớn hơn 0'],
    },
    category: {
      type: String,
      required: true,
      default: 'Ăn uống',
      trim: true,
    },
    note: {
      type: String,
      required: [true, 'Vui lòng nhập nội dung khoản chi tiêu'],
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
    collection: 'expenses',
  }
);

expenseNoteSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('ExpenseNote', expenseNoteSchema);
