const mongoose = require('mongoose');

const DEFAULT_CATEGORIES = [
  { name: 'Lương', color: '#10b981', icon: 'briefcase' },
  { name: 'Freelance', color: '#6366f1', icon: 'laptop' },
  { name: 'Bán hàng', color: '#f59e0b', icon: 'shopping-bag' },
  { name: 'Đầu tư', color: '#06b6d4', icon: 'trending-up' },
  { name: 'Thưởng', color: '#ec4899', icon: 'gift' },
  { name: 'Khác', color: '#8b5cf6', icon: 'sparkles' },
];

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Ăn uống', color: '#f43f5e', icon: 'utensils' },
  { name: 'Di chuyển', color: '#f97316', icon: 'car' },
  { name: 'Mua sắm', color: '#ec4899', icon: 'shopping-bag' },
  { name: 'Hóa đơn & Nhà ở', color: '#8b5cf6', icon: 'receipt' },
  { name: 'Giải trí & Cafe', color: '#06b6d4', icon: 'coffee' },
  { name: 'Sức khỏe & Học tập', color: '#10b981', icon: 'heart-pulse' },
  { name: 'Khác', color: '#64748b', icon: 'tag' },
];

const systemSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'global_settings',
    },
    categories: {
      type: [
        {
          name: { type: String, required: true, trim: true },
          color: { type: String, default: '#6366f1' },
          icon: { type: String, default: 'tag' },
        },
      ],
      default: DEFAULT_CATEGORIES,
    },
    expenseCategories: {
      type: [
        {
          name: { type: String, required: true, trim: true },
          color: { type: String, default: '#f43f5e' },
          icon: { type: String, default: 'tag' },
        },
      ],
      default: DEFAULT_EXPENSE_CATEGORIES,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'system_settings',
  }
);

let cachedSettings = null;
let cachedSettingsAt = 0;

systemSettingSchema.statics.getGlobalSettings = async function (forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedSettings && now - cachedSettingsAt < 60000) {
    return cachedSettings;
  }

  let settings = await this.findOne({ key: 'global_settings' });
  if (!settings) {
    settings = await this.create({
      key: 'global_settings',
      categories: DEFAULT_CATEGORIES,
      expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
    });
  } else if (!settings.expenseCategories || settings.expenseCategories.length === 0) {
    settings.expenseCategories = DEFAULT_EXPENSE_CATEGORIES;
    await settings.save();
  }
  cachedSettings = settings;
  cachedSettingsAt = now;
  return settings;
};

systemSettingSchema.post('save', function (doc) {
  cachedSettings = doc;
  cachedSettingsAt = Date.now();
});

module.exports = {
  SystemSetting: mongoose.model('SystemSetting', systemSettingSchema),
  DEFAULT_CATEGORIES,
  DEFAULT_EXPENSE_CATEGORIES,
};
