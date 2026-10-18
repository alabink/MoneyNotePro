const ExpenseNote = require('../models/ExpenseNote');
const IncomeNote = require('../models/IncomeNote');
const { SystemSetting } = require('../models/SystemSetting');
const { parseSmartExpenseNotepad } = require('../utils/notepadParser');
const { recalculateUserStreak, toLocalDateKey, parseLocalDateSafe } = require('../utils/streakHelper');
const { invalidateUserCache } = require('../middleware/auth');

function syncUserStreakInBackground(userId) {
  setImmediate(async () => {
    try {
      await recalculateUserStreak(userId);
      invalidateUserCache(userId);
    } catch (_) {}
  });
}

// POST /api/expenses/quick - Nhập nhanh 1 dòng chi tiêu kiểu Smart Notepad
exports.createQuickExpense = async (req, res) => {
  try {
    const { rawText, date } = req.body;
    if (!rawText || !rawText.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập nội dung dòng chi tiêu nhanh (VD: 45k Ăn phở bò sáng #Ăn_uống).',
      });
    }

    const settings = await SystemSetting.getGlobalSettings();
    const parsed = parseSmartExpenseNotepad(rawText, settings.expenseCategories);
    const entryDate = parseLocalDateSafe(date);

    const expense = await ExpenseNote.create({
      userId: req.user._id,
      amount: parsed.amount,
      category: parsed.category,
      note: parsed.note,
      date: entryDate,
    });

    syncUserStreakInBackground(req.user._id);

    return res.status(201).json({
      success: true,
      message: `Đã lưu chi tiêu: -${parsed.amount.toLocaleString('vi-VN')} ₫ [${parsed.category}] (${toLocalDateKey(entryDate)})`,
      expense,
      parsed,
      streak: { streakCount: Math.max(1, req.user.streakCount || 1) },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Không thể phân tích cú pháp dòng chi tiêu nhanh.',
    });
  }
};

// POST /api/expenses - Nhập từ Form chi tiết
exports.createExpense = async (req, res) => {
  try {
    const { amount, category, note, date } = req.body;
    const numericAmount = Number(String(amount).replace(/[^\d]/g, ''));

    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Số tiền chi tiêu phải lớn hơn 0 VNĐ.',
      });
    }

    if (!note || !note.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập nội dung khoản chi tiêu.',
      });
    }

    const entryDate = parseLocalDateSafe(date);

    const expense = await ExpenseNote.create({
      userId: req.user._id,
      amount: numericAmount,
      category: category ? category.trim() : 'Ăn uống',
      note: note.trim(),
      date: entryDate,
    });

    syncUserStreakInBackground(req.user._id);

    return res.status(201).json({
      success: true,
      message: 'Đã lưu khoản chi tiêu thành công!',
      expense,
      streak: { streakCount: Math.max(1, req.user.streakCount || 1) },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi khi lưu bản ghi chi tiêu.',
    });
  }
};

// GET /api/expenses - Danh sách lịch sử chi tiêu
exports.getExpenses = async (req, res) => {
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

    const expenses = await ExpenseNote.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(Number(limit))
      .lean();

    const totalFilteredAmount = expenses.reduce((sum, item) => sum + item.amount, 0);

    return res.json({
      success: true,
      count: expenses.length,
      totalAmount: totalFilteredAmount,
      expenses,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Không thể tải danh sách chi tiêu.',
    });
  }
};

// PUT /api/expenses/:id - Cập nhật bản ghi chi tiêu
exports.updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, category, note, date } = req.body;

    const updateFields = {};
    if (amount !== undefined) {
      const numericAmount = Number(String(amount).replace(/[^\d]/g, ''));
      if (!numericAmount || numericAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Số tiền chi tiêu phải lớn hơn 0 VNĐ.',
        });
      }
      updateFields.amount = numericAmount;
    }

    if (category !== undefined && category.trim()) {
      updateFields.category = category.trim();
    }

    if (note !== undefined && note.trim()) {
      updateFields.note = note.trim();
    }

    if (date !== undefined && date) {
      updateFields.date = parseLocalDateSafe(date);
    }

    const expense = await ExpenseNote.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      { $set: updateFields },
      { new: true }
    ).lean();

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khoản chi tiêu này.',
      });
    }

    syncUserStreakInBackground(req.user._id);

    return res.json({
      success: true,
      message: 'Đã cập nhật khoản chi tiêu thành công!',
      expense,
      streak: { streakCount: req.user.streakCount || 1 },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi khi cập nhật khoản chi tiêu.',
    });
  }
};

// DELETE /api/expenses/:id - Xóa bản ghi chi tiêu
exports.deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await ExpenseNote.findOneAndDelete({ _id: id, userId: req.user._id }).lean();

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy khoản chi tiêu cần xóa.',
      });
    }

    syncUserStreakInBackground(req.user._id);

    return res.json({
      success: true,
      message: 'Đã xóa khoản chi tiêu.',
      deletedId: id,
      streak: { streakCount: req.user.streakCount || 0 },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa khoản chi tiêu.',
    });
  }
};

// GET /api/expenses/analytics?month=10&year=2026 - Thống kê chi tiêu theo tháng & ngày
exports.getMonthlyExpenseAnalytics = async (req, res) => {
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

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const minQueryDate = startOfPrevMonth < startOfYear ? startOfPrevMonth : startOfYear;

    const [allRangeExpenses, monthIncomesAgg, allIncomesAgg, pinnedGoal] = await Promise.all([
      ExpenseNote.find({
        userId: req.user._id,
        date: { $gte: minQueryDate, $lte: endOfYear },
      })
        .sort({ date: -1, createdAt: -1 })
        .lean(),
      IncomeNote.aggregate([
        {
          $match: {
            userId: req.user._id,
            date: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        {
          $group: {
            _id: null,
            totalIncome: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
      IncomeNote.aggregate([
        {
          $match: {
            userId: req.user._id,
          },
        },
        {
          $group: {
            _id: null,
            totalIncome: { $sum: '$amount' },
          },
        },
      ]),
      Goal.findOne({ userId: req.user._id }).sort({ isPinned: -1, createdAt: -1 }).lean(),
    ]);

    const totalIncomeMonth = monthIncomesAgg.length > 0 ? monthIncomesAgg[0].totalIncome : 0;
    const allNotepadIncome = allIncomesAgg.length > 0 ? allIncomesAgg[0].totalIncome : 0;
    const goalPrincipal = pinnedGoal ? Math.max(0, Number(pinnedGoal.savingsPrincipal) || 0) : 0;
    const effectiveIncomeBase = totalIncomeMonth > 0 ? totalIncomeMonth : allNotepadIncome + goalPrincipal;

    const monthNotes = [];
    let prevMonthTotal = 0;
    let todayTotal = 0;
    let todayCount = 0;

    const yearlySeries = Array.from({ length: 12 }, (_, idx) => ({
      month: idx + 1,
      label: `Tháng ${idx + 1}`,
      total: 0,
      count: 0,
    }));

    for (const n of allRangeExpenses) {
      const t = new Date(n.date).getTime();
      if (t >= todayStart.getTime() && t <= todayEnd.getTime()) {
        todayTotal += n.amount;
        todayCount += 1;
      }
      if (t >= startOfMonth.getTime() && t <= endOfMonth.getTime()) {
        monthNotes.push(n);
      }
      if (t >= startOfPrevMonth.getTime() && t <= endOfPrevMonth.getTime()) {
        prevMonthTotal += n.amount;
      }
      if (t >= startOfYear.getTime() && t <= endOfYear.getTime()) {
        const mIdx = new Date(n.date).getMonth();
        if (yearlySeries[mIdx]) {
          yearlySeries[mIdx].total += n.amount;
          yearlySeries[mIdx].count += 1;
        }
      }
    }

    const totalMonth = monthNotes.reduce((sum, n) => sum + n.amount, 0);

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

    let highestDay = { day: null, dateStr: null, total: 0, count: 0 };
    for (const dayItem of dailySeries) {
      if (dayItem.total > highestDay.total) {
        highestDay = {
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

    const netBalanceMonth = effectiveIncomeBase - totalMonth;
    const expenseToIncomeRatio =
      effectiveIncomeBase > 0 ? Number(((totalMonth / effectiveIncomeBase) * 100).toFixed(1)) : 0;

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
        todayTotal,
        todayExpenseTotal: todayTotal,
        todayCount,
        todayExpenseCount: todayCount,
        totalMonth,
        totalExpenseMonth: totalMonth,
        prevMonthTotal,
        growthPercent,
        dailyAverage,
        totalEntries: monthNotes.length,
        activeDaysCount: dailySeries.filter((d) => d.total > 0).length,
        highestDay,
        highestExpenseDay: highestDay,
        totalIncomeMonth: effectiveIncomeBase,
        rawIncomeMonth: totalIncomeMonth,
        netBalanceMonth,
        netBalance: netBalanceMonth,
        expenseToIncomeRatio,
      },
      dailySeries,
      yearlySeries,
      categorySeries,
    });
  } catch (error) {
    console.error('Monthly expense analytics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi tính toán dữ liệu thống kê chi tiêu tháng.',
    });
  }
};

// GET /api/expenses/export - Xuất dữ liệu chi tiêu ra CSV hoặc JSON
exports.exportUserExpenses = async (req, res) => {
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

    const notes = await ExpenseNote.find(filter).sort({ date: -1, createdAt: -1 }).lean();

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="moneynote_expenses_${Date.now()}.json"`);
      return res.send(JSON.stringify(notes, null, 2));
    }

    const headers = ['STT', 'Ngày chi tiêu', 'Số tiền chi (VNĐ)', 'Danh mục chi', 'Nội dung chi tiêu', 'Thời gian tạo'];
    const rows = notes.map((n, index) => {
      const dateStr = toLocalDateKey(n.date);
      const createdStr = new Date(n.createdAt).toLocaleString('vi-VN');
      const escapedNote = `"${String(n.note || '').replace(/"/g, '""')}"`;
      const escapedCat = `"${String(n.category || '').replace(/"/g, '""')}"`;
      return [index + 1, dateStr, n.amount, escapedCat, escapedNote, `"${createdStr}"`].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="MoneyNote_ChiTieu_${Date.now()}.csv"`);
    return res.send(csvContent);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xuất dữ liệu chi tiêu.',
    });
  }
};
