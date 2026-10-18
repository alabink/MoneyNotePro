const IncomeNote = require('../models/IncomeNote');
const ExpenseNote = require('../models/ExpenseNote');
const User = require('../models/User');

/**
 * Chuẩn hóa một đối tượng Date về chuỗi YYYY-MM-DD theo giờ cục bộ của máy chủ
 */
function toLocalDateKey(dateInput) {
  const d = new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Chuyển chuỗi YYYY-MM-DD hoặc Date thành đối tượng Date lúc 12:00 trưa giờ cục bộ
 * để tránh tuyệt đối lỗi lệch ngày do múi giờ UTC
 */
function parseLocalDateSafe(dateInput) {
  if (!dateInput) return new Date();
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    const [y, m, d] = dateInput.trim().split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  const parsed = new Date(dateInput);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Tính toán lại chính xác chuỗi ngày nhập thu nhập / chi tiêu liên tiếp (streakCount)
 * và ngày nhập gần nhất (lastEntryDate) của một User dựa trên dữ liệu thực tế.
 */
async function recalculateUserStreak(userId) {
  const [incomeNotes, expenseNotes] = await Promise.all([
    IncomeNote.find({ userId }).select('date').sort({ date: -1 }).lean(),
    ExpenseNote.find({ userId }).select('date').sort({ date: -1 }).lean(),
  ]);

  const notes = [...(incomeNotes || []), ...(expenseNotes || [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  if (!notes || notes.length === 0) {
    await User.findByIdAndUpdate(userId, { streakCount: 0, lastEntryDate: null });
    return { streakCount: 0, lastEntryDate: null };
  }

  const uniqueDays = Array.from(new Set(notes.map((n) => toLocalDateKey(n.date)))).sort().reverse();
  const lastEntryDate = notes[0].date;

  let streak = 1;
  for (let i = 0; i < uniqueDays.length - 1; i++) {
    const [y1, m1, d1] = uniqueDays[i].split('-').map(Number);
    const [y2, m2, d2] = uniqueDays[i + 1].split('-').map(Number);
    const curr = new Date(y1, m1 - 1, d1, 12, 0, 0);
    const prev = new Date(y2, m2 - 1, d2, 12, 0, 0);
    const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }

  await User.findByIdAndUpdate(userId, {
    streakCount: streak,
    lastEntryDate,
  });

  return { streakCount: streak, lastEntryDate };
}

module.exports = {
  recalculateUserStreak,
  toLocalDateKey,
  parseLocalDateSafe,
};
