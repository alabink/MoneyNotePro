const mongoose = require('mongoose');

const systemAnnouncementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Vui lòng nhập tiêu đề thông báo'],
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'Vui lòng nhập nội dung thông báo'],
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'announcements',
  }
);

module.exports = mongoose.model('SystemAnnouncement', systemAnnouncementSchema);
