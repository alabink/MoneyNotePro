const Goal = require('../models/Goal');
const IncomeNote = require('../models/IncomeNote');
const { parseLocalDateSafe } = require('../utils/streakHelper');

/**
 * Tính chính xác số tháng giữa startDate và endDate.
 * Ví dụ:
 *  - 16/10/2026 -> 16/04/2027 = 6 tháng chẵn
 *  - 01/10/2026 -> 31/03/2027 = 6 tháng chẵn
 *  - Nếu gia hạn thêm ngày lẻ, tính tỷ lệ ngày/30.
 */
function calculateDurationMonths(startDateInput, endDateInput) {
  const start = new Date(startDateInput);
  const end = new Date(endDateInput);
  if (end <= start) return 0;

  const yearDiff = end.getFullYear() - start.getFullYear();
  const monthDiff = end.getMonth() - start.getMonth();
  const dayDiff = end.getDate() - start.getDate();

  let totalMonths = yearDiff * 12 + monthDiff;

  // Trường hợp chọn từ ngày đầu tháng (1) đến ngày cuối tháng (28/29/30/31)
  const lastDayOfEndMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  if (start.getDate() === 1 && end.getDate() === lastDayOfEndMonth) {
    totalMonths += 1;
  } else if (dayDiff !== 0) {
    totalMonths += dayDiff / 30;
  }

  return Math.max(0, Number(totalMonths.toFixed(4)));
}

/**
 * Tính toán chi tiết tiến độ Mục tiêu + Tiền tiết kiệm & Lãi suất hàng tháng + Pace Calculator
 */
async function enrichGoalWithProgress(goalDoc) {
  const goal = goalDoc.toObject ? goalDoc.toObject() : { ...goalDoc };

  const start = new Date(goal.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(goal.endDate);
  end.setHours(23, 59, 59, 999);
  const now = new Date();

  // 1. Tổng tiền kiếm thêm từ Sổ tay Notepad (IncomeNote) trong khoảng startDate -> endDate
  const agg = await IncomeNote.aggregate([
    {
      $match: {
        userId: goal.userId,
        date: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  const notepadIncomeAmount = agg.length > 0 ? agg[0].total : 0;
  const entryCount = agg.length > 0 ? agg[0].count : 0;

  // 2. Tính Tiền tiết kiệm gốc (tiền đã làm được) & Lãi suất hàng tháng
  // Ví dụ: Gửi 200.000.000 VNĐ, lãi 8% trong 6 tháng -> Mỗi tháng lãi 8% / 6 = 1.3333%/tháng = 2.666.667 VNĐ/tháng
  const savingsPrincipal = Math.max(0, Number(goal.savingsPrincipal) || 0);
  const interestRate = Math.max(0, Number(goal.interestRate) || 0);
  const interestTermMonths = Math.max(1, Number(goal.interestTermMonths) || 6);

  // Lãi suất mỗi tháng (%) = interestRate / interestTermMonths (VD: 8 / 6 = 1.333333%)
  const monthlyInterestRateRaw = interestRate > 0 ? interestRate / interestTermMonths : 0;
  const monthlyInterestRateDisplay = Number(monthlyInterestRateRaw.toFixed(4));

  // Số tiền lãi nhận được mỗi tháng (VNĐ)
  const monthlyInterestAmount =
    savingsPrincipal > 0 && monthlyInterestRateRaw > 0
      ? Math.round(savingsPrincipal * (monthlyInterestRateRaw / 100))
      : 0;

  // Số tháng thực tế tính từ startDate đến hạn endDate (nếu người dùng sửa hạn endDate thì tự động tính tiếp lãi)
  const activeDurationMonths = calculateDurationMonths(start, end);
  const displayDurationMonths = Number(activeDurationMonths.toFixed(2));

  // Tổng tiền lãi tính theo toàn bộ thời hạn startDate -> endDate
  const totalProjectedInterest =
    savingsPrincipal > 0 && monthlyInterestRateRaw > 0
      ? Math.round(savingsPrincipal * (monthlyInterestRateRaw / 100) * activeDurationMonths)
      : 0;

  // Số tháng đã trôi qua tính đến hôm nay (để biết lãi đã phát sinh đến thời điểm hiện tại)
  const effectiveNow = now < start ? start : now > end ? end : now;
  const elapsedMonths = calculateDurationMonths(start, effectiveNow);
  const accruedInterestToDate =
    savingsPrincipal > 0 && monthlyInterestRateRaw > 0
      ? Math.round(savingsPrincipal * (monthlyInterestRateRaw / 100) * elapsedMonths)
      : 0;

  // Tạo bảng lịch trả lãi từng tháng (Monthly Interest Schedule)
  const scheduleCount = Math.min(36, Math.max(1, Math.ceil(activeDurationMonths)));
  const monthlySchedule = [];
  if (savingsPrincipal > 0 && monthlyInterestRateRaw > 0) {
    for (let m = 1; m <= scheduleCount; m++) {
      const factor = m <= Math.floor(activeDurationMonths) ? 1 : activeDurationMonths - Math.floor(activeDurationMonths) || 1;
      const monthInterest = Math.round(monthlyInterestAmount * factor);
      const cumulativeInterest = Math.round(
        savingsPrincipal * (monthlyInterestRateRaw / 100) * Math.min(m, activeDurationMonths)
      );
      const milestoneDate = new Date(start);
      milestoneDate.setMonth(milestoneDate.getMonth() + m);

      monthlySchedule.push({
        monthNumber: m,
        date: milestoneDate,
        ratePercent: Number((monthlyInterestRateRaw * factor).toFixed(4)),
        interestAmount: monthInterest,
        cumulativeInterest,
        totalWithPrincipal: savingsPrincipal + cumulativeInterest,
      });
    }
  }

  // 3. Tổng số tiền đã đạt được của Mục tiêu = Tiền tiết kiệm gốc + Tiền lãi theo hạn + Thu nhập từ Sổ tay
  const savingsWithInterest = savingsPrincipal + totalProjectedInterest;
  const currentAmount = savingsWithInterest + notepadIncomeAmount;

  const targetAmount = goal.targetAmount;
  const remainingAmount = Math.max(0, targetAmount - currentAmount);
  const rawPercent = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
  const progressPercent = Number(Math.min(100, rawPercent).toFixed(1));
  const overAchievedPercent = Number(rawPercent.toFixed(1));

  // 4. Tính số ngày & Máy tính tốc độ kiếm tiền (Pace Calculator) cho phần tiền còn thiếu
  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / msPerDay));

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endDayStart = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 0, 0, 0, 0);

  const diffDaysToEnd = Math.floor((endDayStart.getTime() - todayStart.getTime()) / msPerDay) + 1;
  const remainingDays = Math.max(0, diffDaysToEnd);

  const startDayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
  const elapsedDays = Math.min(
    totalDays,
    Math.max(1, Math.floor((todayStart.getTime() - startDayStart.getTime()) / msPerDay) + 1)
  );

  const requiredDailyPace =
    remainingAmount === 0
      ? 0
      : remainingDays > 0
      ? Math.ceil(remainingAmount / remainingDays)
      : remainingAmount;

  const baselineDailyPace = Math.ceil(targetAmount / totalDays);
  const actualDailyPace = Math.round(currentAmount / elapsedDays);
  const expectedAmountByNow = Math.min(targetAmount, baselineDailyPace * elapsedDays);
  const expectedPercentByNow = Math.min(100, (elapsedDays / totalDays) * 100);

  let paceStatus = 'on_track';
  let paceBadge = 'Đúng tiến độ';
  let paceMessage = '';
  let status = goal.status;

  if (currentAmount >= targetAmount) {
    status = 'completed';
    paceStatus = 'completed';
    paceBadge = 'Đã đạt mục tiêu 🎉';
    paceMessage = `Chúc mừng! Tổng tích lũy (Gốc + Lãi + Sổ tay) đã đạt ${overAchievedPercent}% mục tiêu (${currentAmount.toLocaleString(
      'vi-VN'
    )} ₫ / ${targetAmount.toLocaleString('vi-VN')} ₫).`;
  } else if (now > end) {
    status = 'failed';
    paceStatus = 'failed';
    paceBadge = 'Đã quá hạn';
    paceMessage = `Mục tiêu đã kết thúc hạn. Còn thiếu ${remainingAmount.toLocaleString('vi-VN')} ₫ (Bạn có thể bấm "Gia hạn / Gửi thêm" để tiếp tục tính lãi).`;
  } else {
    status = 'in_progress';
    const progressDelta = rawPercent - expectedPercentByNow;

    if (progressDelta >= 5) {
      paceStatus = 'ahead';
      paceBadge = 'Vượt tiến độ 🚀';
    } else if (progressDelta <= -5) {
      paceStatus = 'behind';
      paceBadge = 'Chậm tiến độ ⚠️';
    } else {
      paceStatus = 'on_track';
      paceBadge = 'Đúng tiến độ ✅';
    }

    paceMessage = `Sau khi cộng Tiền gốc (${savingsPrincipal.toLocaleString(
      'vi-VN'
    )} ₫) & Lãi kỳ hạn (+${totalProjectedInterest.toLocaleString(
      'vi-VN'
    )} ₫), cần kiếm thêm trung bình ${requiredDailyPace.toLocaleString(
      'vi-VN'
    )} VNĐ/ngày trong ${remainingDays} ngày còn lại.`;
  }

  if (goalDoc.status !== status && goalDoc.save) {
    goalDoc.status = status;
    await goalDoc.save();
  }

  return {
    ...goal,
    savingsPrincipal,
    interestRate,
    interestTermMonths,
    status,
    metrics: {
      currentAmount,
      targetAmount,
      remainingAmount,
      notepadIncomeAmount,
      savingsPrincipal,
      interestRate,
      interestTermMonths,
      monthlyInterestRateDisplay,
      monthlyInterestAmount,
      activeDurationMonths: displayDurationMonths,
      totalProjectedInterest,
      accruedInterestToDate,
      savingsWithInterest,
      monthlySchedule,
      progressPercent,
      overAchievedPercent,
      entryCount,
      totalDays,
      elapsedDays,
      remainingDays,
      requiredDailyPace,
      actualDailyPace,
      baselineDailyPace,
      expectedAmountByNow,
      expectedPercentByNow: Number(expectedPercentByNow.toFixed(1)),
      paceStatus,
      paceBadge,
      paceMessage,
    },
  };
}

// GET /api/goals - Lấy danh sách mục tiêu + mục tiêu được ghim (Hero Goal)
exports.getGoals = async (req, res) => {
  try {
    const goals = await Goal.find({ userId: req.user._id }).sort({ isPinned: -1, createdAt: -1 });
    const enrichedGoals = await Promise.all(goals.map((g) => enrichGoalWithProgress(g)));

    const pinnedGoal = enrichedGoals.find((g) => g.isPinned) || enrichedGoals[0] || null;

    return res.json({
      success: true,
      pinnedGoal,
      goals: enrichedGoals,
    });
  } catch (error) {
    console.error('Get goals error:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể tải danh sách mục tiêu tài chính.',
    });
  }
};

// POST /api/goals - Tạo mục tiêu mới (có hỗ trợ Tiền tiết kiệm đã có & Lãi suất)
exports.createGoal = async (req, res) => {
  try {
    const {
      title,
      targetAmount,
      savingsPrincipal = 0,
      interestRate = 0,
      interestTermMonths = 6,
      startDate,
      endDate,
      isPinned,
    } = req.body;

    const numericTarget = Number(String(targetAmount).replace(/[^\d]/g, ''));
    const numericSavings = Number(String(savingsPrincipal || '0').replace(/[^\d]/g, '')) || 0;
    const numericRate = parseFloat(String(interestRate || '0').replace(',', '.')) || 0;
    const numericTerm = Math.max(1, parseInt(interestTermMonths, 10) || 6);

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên mục tiêu.' });
    }
    if (!numericTarget || numericTarget <= 0) {
      return res.status(400).json({ success: false, message: 'Số tiền mục tiêu phải lớn hơn 0 VNĐ.' });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ngày bắt đầu và ngày kết thúc.' });
    }

    const parsedStart = parseLocalDateSafe(startDate);
    const parsedEnd = parseLocalDateSafe(endDate);

    if (parsedEnd < parsedStart) {
      return res.status(400).json({ success: false, message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.' });
    }

    const existingCount = await Goal.countDocuments({ userId: req.user._id });
    const shouldPin = Boolean(isPinned) || existingCount === 0;

    if (shouldPin) {
      await Goal.updateMany({ userId: req.user._id }, { isPinned: false });
    }

    const goal = await Goal.create({
      userId: req.user._id,
      title: title.trim(),
      targetAmount: numericTarget,
      savingsPrincipal: numericSavings,
      interestRate: numericRate,
      interestTermMonths: numericTerm,
      startDate: parsedStart,
      endDate: parsedEnd,
      isPinned: shouldPin,
      status: 'in_progress',
    });

    const enriched = await enrichGoalWithProgress(goal);

    return res.status(201).json({
      success: true,
      message: 'Đã tạo mục tiêu tài chính & thiết lập tính lãi tiết kiệm!',
      goal: enriched,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi khi tạo mục tiêu tài chính.',
    });
  }
};

// PUT /api/goals/:id - Cập nhật mục tiêu, số tiền gửi thêm hoặc gia hạn ngày kết thúc
exports.updateGoal = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      targetAmount,
      savingsPrincipal,
      additionalDeposit,
      interestRate,
      interestTermMonths,
      startDate,
      endDate,
      extendMonths,
      isPinned,
    } = req.body;

    const goal = await Goal.findOne({ _id: id, userId: req.user._id });
    if (!goal) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy mục tiêu này.' });
    }

    if (title !== undefined && title.trim()) goal.title = title.trim();

    if (targetAmount !== undefined) {
      const numericTarget = Number(String(targetAmount).replace(/[^\d]/g, ''));
      if (numericTarget > 0) goal.targetAmount = numericTarget;
    }

    // Cập nhật tổng tiền tiết kiệm hoặc cộng dồn tiền gửi thêm
    if (savingsPrincipal !== undefined) {
      goal.savingsPrincipal = Number(String(savingsPrincipal || '0').replace(/[^\d]/g, '')) || 0;
    }
    if (additionalDeposit !== undefined) {
      const addAmt = Number(String(additionalDeposit || '0').replace(/[^\d]/g, '')) || 0;
      if (addAmt > 0) {
        goal.savingsPrincipal = (goal.savingsPrincipal || 0) + addAmt;
      }
    }

    if (interestRate !== undefined) {
      goal.interestRate = Math.max(0, parseFloat(String(interestRate).replace(',', '.')) || 0);
    }

    if (interestTermMonths !== undefined) {
      goal.interestTermMonths = Math.max(1, parseInt(interestTermMonths, 10) || 6);
    }

    if (startDate) goal.startDate = parseLocalDateSafe(startDate);
    if (endDate) goal.endDate = parseLocalDateSafe(endDate);

    // Nếu người dùng chọn gia hạn nhanh thêm X tháng
    if (extendMonths && Number(extendMonths) > 0) {
      const currentEnd = new Date(goal.endDate);
      currentEnd.setMonth(currentEnd.getMonth() + Number(extendMonths));
      goal.endDate = currentEnd;
    }

    if (new Date(goal.endDate) < new Date(goal.startDate)) {
      return res.status(400).json({
        success: false,
        message: 'Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.',
      });
    }

    if (isPinned === true) {
      await Goal.updateMany({ userId: req.user._id, _id: { $ne: goal._id } }, { isPinned: false });
      goal.isPinned = true;
    } else if (isPinned === false) {
      goal.isPinned = false;
    }

    await goal.save();
    const enriched = await enrichGoalWithProgress(goal);

    return res.json({
      success: true,
      message: 'Đã cập nhật mục tiêu & tự động tính lại tiền lãi theo hạn mới!',
      goal: enriched,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi khi cập nhật mục tiêu.',
    });
  }
};

// PATCH /api/goals/:id/pin - Ghim mục tiêu lên trang chủ (Hero Banner)
exports.pinGoal = async (req, res) => {
  try {
    const { id } = req.params;
    const goal = await Goal.findOne({ _id: id, userId: req.user._id });

    if (!goal) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy mục tiêu cần ghim.' });
    }

    await Goal.updateMany({ userId: req.user._id }, { isPinned: false });
    goal.isPinned = true;
    await goal.save();

    const enriched = await enrichGoalWithProgress(goal);

    return res.json({
      success: true,
      message: `Đã ghim mục tiêu "${goal.title}" lên đầu trang chủ!`,
      goal: enriched,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi ghim mục tiêu.',
    });
  }
};

// DELETE /api/goals/:id - Xóa mục tiêu
exports.deleteGoal = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Goal.findOneAndDelete({ _id: id, userId: req.user._id });

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy mục tiêu cần xóa.' });
    }

    if (deleted.isPinned) {
      const nextGoal = await Goal.findOne({ userId: req.user._id }).sort({ createdAt: -1 });
      if (nextGoal) {
        nextGoal.isPinned = true;
        await nextGoal.save();
      }
    }

    return res.json({
      success: true,
      message: 'Đã xóa mục tiêu tài chính.',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa mục tiêu.',
    });
  }
};

module.exports.enrichGoalWithProgress = enrichGoalWithProgress;
