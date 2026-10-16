const IncomeNote = require('../models/IncomeNote');
const Goal = require('../models/Goal');
const { SystemSetting } = require('../models/SystemSetting');
const { parseSmartNotepad } = require('../utils/notepadParser');
const { recalculateUserStreak, toLocalDateKey, parseLocalDateSafe } = require('../utils/streakHelper');
const { enrichGoalWithProgress } = require('./goalController');

/**
 * Tự động đồng bộ trạng thái các mục tiêu của User khi có thay đổi thu nhập
 */
async function syncUserGoalsStatus(userId) {
  const goals = await Goal.find({ userId });
  for (const goal of goals) {
    await enrichGoalWithProgress(goal);
  }
}

// POST /api/incomes/quick - Nhập nhanh 1 dòng kiểu Smart Notepad (hỗ trợ chọn ngày bất kỳ hoặc hôm nay)
exports.createQuickIncome = async (req, res) => {
  try {
    const { rawText, date } = req.body;
    if (!rawText || !rawText.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập nội dung dòng ghi chú nhanh (VD: 500k Làm web cho khách #Freelance).',
      });
    }

    const settings = await SystemSetting.getGlobalSettings();
    const parsed = parseSmartNotepad(rawText, settings.categories);
    const entryDate = parseLocalDateSafe(date);

    const income = await IncomeNote.create({
      userId: req.user._id,
      amount: parsed.amount,
      category: parsed.category,
      note: parsed.note,
      date: entryDate,
    });

    const streakInfo = await recalculateUserStreak(req.user._id);
    await syncUserGoalsStatus(req.user._id);

    return res.status(201).json({
      success: true,
      message: `Đã lưu: +${parsed.amount.toLocaleString('vi-VN')} ₫ [${parsed.category}] (${toLocalDateKey(entryDate)})`,
      income,
      parsed,
      streak: streakInfo,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Không thể phân tích cú pháp dòng nhập nhanh.',
    });
  }
};

// POST /api/incomes - Nhập từ Form chi tiết
exports.createIncome = async (req, res) => {
  try {
    const { amount, category, note, date } = req.body;
    const numericAmount = Number(String(amount).replace(/[^\d]/g, ''));

    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Số tiền thu nhập phải lớn hơn 0 VNĐ.',
      });
    }

    if (!note || !note.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập nội dung ghi chú thu nhập.',
      });
    }

    const entryDate = parseLocalDateSafe(date);

    const income = await IncomeNote.create({
      userId: req.user._id,
      amount: numericAmount,
      category: category ? category.trim() : 'Khác',
      note: note.trim(),
      date: entryDate,
    });

    const streakInfo = await recalculateUserStreak(req.user._id);
    await syncUserGoalsStatus(req.user._id);

    return res.status(201).json({
      success: true,
      message: 'Đã lưu bản ghi thu nhập thành công!',
      income,
      streak: streakInfo,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi khi lưu bản ghi thu nhập.',
    });
  }
};

// GET /api/incomes - Danh sách lịch sử ghi chú (tìm kiếm, lọc danh mục, lọc ngày cụ thể hoặc khoảng ngày)
exports.getIncomes = async (req, res) => {
  try {
    const { search, category, date, startDate, endDate, month, year, limit = 300 } = req.query;
    const filter = { userId: req.user._id };

    if (category && category !== 'all') {
      filter.category = category;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [{ note: regex }, { category: regex }];
    }

    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      const [y, m, d] = date.trim().split('-').map(Number);
      filter.date = {
        $gte: new Date(y, m - 1, d, 0, 0, 0, 0),
        $lte: new Date(y, m - 1, d, 23, 59, 59, 999),
      };
    } else if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        const s = parseLocalDateSafe(startDate);
        s.setHours(0, 0, 0, 0);
        filter.date.$gte = s;
      }
      if (endDate) {
        const e = parseLocalDateSafe(endDate);
        e.setHours(23, 59, 59, 999);
        filter.date.$lte = e;
      }
    } else if (month && year) {
      const m = parseInt(month, 10);
      const y = parseInt(year, 10);
      const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
      const end = new Date(y, m, 0, 23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }

    const incomes = await IncomeNote.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(Number(limit));

    const totalFilteredAmount = incomes.reduce((sum, item) => sum + item.amount, 0);

    return res.json({
      success: true,
      count: incomes.length,
      totalAmount: totalFilteredAmount,
      incomes,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Không thể tải danh sách thu nhập.',
    });
  }
};

// PUT /api/incomes/:id - Cập nhật bản ghi thu nhập (sửa ngày cũ hoặc bất kỳ thông tin nào)
exports.updateIncome = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, category, note, date } = req.body;

    const income = await IncomeNote.findOne({ _id: id, userId: req.user._id });
    if (!income) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bản ghi thu nhập này.',
      });
    }

    if (amount !== undefined) {
      const numericAmount = Number(String(amount).replace(/[^\d]/g, ''));
      if (!numericAmount || numericAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Số tiền phải lớn hơn 0 VNĐ.',
        });
      }
      income.amount = numericAmount;
    }

    if (category !== undefined && category.trim()) {
      income.category = category.trim();
    }

    if (note !== undefined && note.trim()) {
      income.note = note.trim();
    }

    if (date !== undefined && date) {
      income.date = parseLocalDateSafe(date);
    }

    await income.save();
    const streakInfo = await recalculateUserStreak(req.user._id);
    await syncUserGoalsStatus(req.user._id);

    return res.json({
      success: true,
      message: 'Đã cập nhật ghi chú thu nhập thành công!',
      income,
      streak: streakInfo,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi khi cập nhật bản ghi.',
    });
  }
};

// DELETE /api/incomes/:id - Xóa bản ghi thu nhập
exports.deleteIncome = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await IncomeNote.findOneAndDelete({ _id: id, userId: req.user._id });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bản ghi thu nhập cần xóa.',
      });
    }

    const streakInfo = await recalculateUserStreak(req.user._id);
    await syncUserGoalsStatus(req.user._id);

    return res.json({
      success: true,
      message: 'Đã xóa bản ghi thu nhập.',
      streak: streakInfo,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa bản ghi thu nhập.',
    });
  }
};

// GET /api/incomes/analytics?month=10&year=2026 - Thống kê chi tiết theo Tháng & Năm
exports.getMonthlyAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month, 10) || now.getMonth() + 1;
    const year = parseInt(req.query.year, 10) || now.getFullYear();

    const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
    const daysInMonth = endOfMonth.getDate();

    const startOfPrevMonth = new Date(year, month - 2, 1, 0, 0, 0, 0);
    const endOfPrevMonth = new Date(year, month - 1, 0, 23, 59, 59, 999);

    const startOfYear = new Date(year, 0, 1, 0, 0, 0, 0);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);

    const [monthNotes, prevMonthNotes, yearNotes] = await Promise.all([
      IncomeNote.find({
        userId: req.user._id,
        date: { $gte: startOfMonth, $lte: endOfMonth },
      })
        .sort({ date: -1, createdAt: -1 })
        .lean(),
      IncomeNote.find({
        userId: req.user._id,
        date: { $gte: startOfPrevMonth, $lte: endOfPrevMonth },
      })
        .select('amount')
        .lean(),
      IncomeNote.find({
        userId: req.user._id,
        date: { $gte: startOfYear, $lte: endOfYear },
      })
        .select('amount date category')
        .lean(),
    ]);

    const totalMonth = monthNotes.reduce((sum, n) => sum + n.amount, 0);
    const prevMonthTotal = prevMonthNotes.reduce((sum, n) => sum + n.amount, 0);

    let growthPercent = 0;
    if (prevMonthTotal > 0) {
      growthPercent = Number((((totalMonth - prevMonthTotal) / prevMonthTotal) * 100).toFixed(1));
    } else if (totalMonth > 0) {
      growthPercent = 100;
    }

    const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
    const elapsedDays = isCurrentMonth ? Math.max(1, now.getDate()) : daysInMonth;
    const dailyAverage = Math.round(totalMonth / elapsedDays);

    const dailyMap = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      dailyMap[d] = {
        day: d,
        dateStr,
        total: 0,
        count: 0,
        items: [],
      };
    }

    const categoryMap = {};

    for (const note of monthNotes) {
      const dObj = new Date(note.date);
      const dayNum = dObj.getDate();
      if (dailyMap[dayNum]) {
        dailyMap[dayNum].total += note.amount;
        dailyMap[dayNum].count += 1;
        dailyMap[dayNum].items.push({
          _id: note._id,
          amount: note.amount,
          category: note.category,
          note: note.note,
          date: note.date,
          createdAt: note.createdAt,
        });
      }

      if (!categoryMap[note.category]) {
        categoryMap[note.category] = { category: note.category, total: 0, count: 0 };
      }
      categoryMap[note.category].total += note.amount;
      categoryMap[note.category].count += 1;
    }

    const dailySeries = Object.values(dailyMap);

    let bestDay = { day: null, dateStr: null, total: 0, count: 0 };
    for (const dayItem of dailySeries) {
      if (dayItem.total > bestDay.total) {
        bestDay = {
          day: dayItem.day,
          dateStr: dayItem.dateStr,
          total: dayItem.total,
          count: dayItem.count,
        };
      }
    }

    const categorySeries = Object.values(categoryMap)
      .map((c) => ({
        ...c,
        percentage: totalMonth > 0 ? Number(((c.total / totalMonth) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const yearlySeries = Array.from({ length: 12 }, (_, idx) => ({
      month: idx + 1,
      label: `Tháng ${idx + 1}`,
      total: 0,
      count: 0,
    }));

    for (const note of yearNotes) {
      const mIdx = new Date(note.date).getMonth();
      if (yearlySeries[mIdx]) {
        yearlySeries[mIdx].total += note.amount;
        yearlySeries[mIdx].count += 1;
      }
    }

    const streak = await recalculateUserStreak(req.user._id);

    return res.json({
      success: true,
      period: {
        month,
        year,
        daysInMonth,
        elapsedDays,
        firstDayWeekday: startOfMonth.getDay(),
      },
      summary: {
        totalMonth,
        prevMonthTotal,
        growthPercent,
        dailyAverage,
        totalEntries: monthNotes.length,
        activeDaysCount: dailySeries.filter((d) => d.total > 0).length,
        bestDay,
      },
      streak,
      dailySeries,
      yearlySeries,
      categorySeries,
    });
  } catch (error) {
    console.error('Monthly analytics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi tính toán dữ liệu thống kê tháng.',
    });
  }
};

// GET /api/incomes/export - Xuất dữ liệu cá nhân ra CSV hoặc JSON
exports.exportUserIncomes = async (req, res) => {
  try {
    const { format = 'csv', month, year } = req.query;
    const filter = { userId: req.user._id };

    if (month && year) {
      const m = parseInt(month, 10);
      const y = parseInt(year, 10);
      filter.date = {
        $gte: new Date(y, m - 1, 1, 0, 0, 0, 0),
        $lte: new Date(y, m, 0, 23, 59, 59, 999),
      };
    }

    const notes = await IncomeNote.find(filter).sort({ date: -1, createdAt: -1 }).lean();

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="moneynote_incomes_${Date.now()}.json"`);
      return res.send(JSON.stringify(notes, null, 2));
    }

    const headers = ['STT', 'Ngày ghi nhận', 'Số tiền (VNĐ)', 'Danh mục', 'Nội dung ghi chú', 'Thời gian tạo'];
    const rows = notes.map((n, index) => {
      const dateStr = toLocalDateKey(n.date);
      const createdStr = new Date(n.createdAt).toLocaleString('vi-VN');
      const escapedNote = `"${String(n.note || '').replace(/"/g, '""')}"`;
      const escapedCat = `"${String(n.category || '').replace(/"/g, '""')}"`;
      return [index + 1, dateStr, n.amount, escapedCat, escapedNote, `"${createdStr}"`].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="MoneyNote_ThuNhap_${Date.now()}.csv"`);
    return res.send(csvContent);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xuất dữ liệu thu nhập.',
    });
  }
};
