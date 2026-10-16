/**
 * Smart Notepad Syntax Parser cho MoneyNote Pro
 * Hỗ trợ cú pháp gõ nhanh:
 *   - "500k Làm web cho khách #Freelance" -> { amount: 500000, note: "Làm web cho khách", category: "Freelance" }
 *   - "1tr5 Bán hàng ngày mưa" -> { amount: 1500000, note: "Bán hàng ngày mưa", category: "Bán hàng" }
 *   - "2.5tr Thưởng dự án vượt KPI #Thưởng" -> { amount: 2500000, note: "Thưởng dự án vượt KPI", category: "Thưởng" }
 *   - "15.000.000 Lương tháng 10 #Lương" -> { amount: 15000000, note: "Lương tháng 10", category: "Lương" }
 */

const CATEGORY_ALIASES = [
  { canonical: 'Lương', keywords: ['luong', 'lương', 'salary', 'payroll'] },
  { canonical: 'Freelance', keywords: ['freelance', 'job', 'duan', 'dự án', 'lam web', 'làm web', 'code', 'design', 'thiet ke'] },
  { canonical: 'Bán hàng', keywords: ['banhang', 'bán hàng', 'ban hang', 'shop', 'order', 'đơn hàng', 'don hang', 'khach mua'] },
  { canonical: 'Đầu tư', keywords: ['dautu', 'đầu tư', 'dau tu', 'co tuc', 'cổ tức', 'crypto', 'coin', 'chung khoan', 'chứng khoán', 'lãi', 'vang', 'vàng'] },
  { canonical: 'Thưởng', keywords: ['thuong', 'thưởng', 'bonus', 'kpi', 'li xi', 'lì xì', 'tip', 'hoa hong', 'hoa hồng'] },
  { canonical: 'Khác', keywords: ['khac', 'khác', 'other'] },
];

function removeVietnameseTones(str = '') {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Chuẩn hóa tên danh mục từ hashtag hoặc từ khóa tự động
 */
function resolveCategory(rawTag, noteText = '', availableCategories = []) {
  const customNames = availableCategories.map((c) => (typeof c === 'string' ? c : c.name));

  if (rawTag) {
    const cleanTag = rawTag.replace(/^#/, '').replace(/_/g, ' ').trim();
    const normTag = removeVietnameseTones(cleanTag);

    // 1. Khớp với danh mục có sẵn trong hệ thống
    for (const catName of customNames) {
      if (removeVietnameseTones(catName) === normTag || removeVietnameseTones(catName).replace(/\s+/g, '') === normTag.replace(/\s+/g, '')) {
        return catName;
      }
    }

    // 2. Khớp với bảng alias mặc định
    for (const item of CATEGORY_ALIASES) {
      const normCanonical = removeVietnameseTones(item.canonical);
      if (
        normCanonical === normTag ||
        normCanonical.replace(/\s+/g, '') === normTag.replace(/\s+/g, '') ||
        item.keywords.some((k) => removeVietnameseTones(k).replace(/\s+/g, '') === normTag.replace(/\s+/g, ''))
      ) {
        return item.canonical;
      }
    }

    // Nếu người dùng gõ hashtag riêng (VD: #Affiliate), viết hoa chữ cái đầu
    return cleanTag.charAt(0).toUpperCase() + cleanTag.slice(1);
  }

  // Không có hashtag -> Tự động đoán danh mục từ nội dung ghi chú
  const normNote = removeVietnameseTones(noteText);
  for (const item of CATEGORY_ALIASES) {
    if (item.keywords.some((kw) => normNote.includes(removeVietnameseTones(kw)))) {
      return item.canonical;
    }
  }

  return 'Khác';
}

/**
 * Phân tích một token tiền tệ tiếng Việt thành số VNĐ
 * Hỗ trợ: 500k, 1tr5, 1.5tr, 2m5, 2củ5, 15tr, 500.000, 1,500,000, 250000
 */
function parseAmountToken(token) {
  if (!token) return null;
  const clean = token.trim().toLowerCase();

  // Dạng 1: 1tr5, 1m5, 1cu5, 1củ5, 1triệu5 (X triệu Y trăm nghìn)
  const splitMillionMatch = clean.match(/^(\d+)(?:tr|trieu|triệu|m|cu|củ)(\d+)$/i);
  if (splitMillionMatch) {
    const millions = parseInt(splitMillionMatch[1], 10);
    const decimalStr = splitMillionMatch[2];
    const fraction = parseInt(decimalStr, 10) / Math.pow(10, decimalStr.length);
    return Math.round((millions + fraction) * 1000000);
  }

  // Dạng 2: 1.5tr, 1,5tr, 15tr, 2m, 2.5m, 3củ
  const millionMatch = clean.match(/^(\d+(?:[.,]\d+)?)(?:tr|trieu|triệu|m|cu|củ)$/i);
  if (millionMatch) {
    const val = parseFloat(millionMatch[1].replace(',', '.'));
    return Math.round(val * 1000000);
  }

  // Dạng 3: 500k, 50k, 1.5k, 200ng, 200nghin
  const thousandMatch = clean.match(/^(\d+(?:[.,]\d+)?)(?:k|ng|nghin|nghìn|ngan|ngàn)$/i);
  if (thousandMatch) {
    const val = parseFloat(thousandMatch[1].replace(',', '.'));
    return Math.round(val * 1000);
  }

  // Dạng 4: Số có dấu chấm hoặc phẩy phân cách hàng nghìn (VD: 500.000 hoặc 1,500,000)
  if (/^\d{1,3}([.,]\d{3})+(?:đ|d|vnd|vnđ)?$/i.test(clean)) {
    const digitsOnly = clean.replace(/[^\d]/g, '');
    return parseInt(digitsOnly, 10);
  }

  // Dạng 5: Số nguyên thuần túy (VD: 500000 hoặc 50000đ)
  const plainMatch = clean.match(/^(\d{4,12})(?:đ|d|vnd|vnđ)?$/i);
  if (plainMatch) {
    return parseInt(plainMatch[1], 10);
  }

  // Dạng 6: Số nhỏ (VD: "500" ở đầu câu ngầm hiểu là 500.000đ nếu < 1000)
  const smallNumMatch = clean.match(/^(\d{1,3})$/);
  if (smallNumMatch) {
    const num = parseInt(smallNumMatch[1], 10);
    if (num > 0) return num * 1000;
  }

  return null;
}

/**
 * Hàm chính bóc tách dòng Smart Notepad
 * @param {string} rawLine Chuỗi người dùng gõ (VD: "500k Làm web cho khách #Freelance")
 * @param {Array} availableCategories Danh mục hệ thống hiện có
 */
function parseSmartNotepad(rawLine, availableCategories = []) {
  if (!rawLine || typeof rawLine !== 'string') {
    throw new Error('Nội dung dòng nhập nhanh không hợp lệ');
  }

  let text = rawLine.trim();

  // 1. Bóc tách hashtag ở cuối hoặc bất kỳ vị trí nào (hỗ trợ #Freelance, #Bán_hàng, "#Bán hàng")
  let extractedTag = null;
  const hashtagRegex = /#([^\s#]+(?:\s+hàng|\s+tư)?)/i;
  const tagMatch = text.match(hashtagRegex);
  if (tagMatch) {
    extractedTag = tagMatch[1].trim();
    text = text.replace(tagMatch[0], '').trim();
  }

  // 2. Bóc tách số tiền ở đầu câu hoặc trong các token
  const tokens = text.split(/\s+/);
  let amount = null;
  let amountTokenIndex = -1;

  for (let i = 0; i < tokens.length; i++) {
    // Chỉ cho phép đoán số nhỏ (<1000 -> nhân 1000) nếu nằm ở token đầu tiên
    const candidate = tokens[i];
    if (i > 0 && /^\d{1,3}$/.test(candidate)) continue;

    const parsed = parseAmountToken(candidate);
    if (parsed && parsed > 0) {
      amount = parsed;
      amountTokenIndex = i;
      break;
    }
  }

  if (!amount || amount <= 0) {
    throw new Error(
      'Không tìm thấy số tiền hợp lệ. Ví dụ cú pháp đúng: "500k Làm web cho khách #Freelance" hoặc "1tr5 Bán hàng ngày mưa"'
    );
  }

  // Loại bỏ token tiền khỏi câu để lấy phần nội dung ghi chú
  const noteTokens = tokens.filter((_, idx) => idx !== amountTokenIndex);
  let note = noteTokens.join(' ').replace(/^[-:–—]+\s*/, '').trim();

  const category = resolveCategory(extractedTag, note, availableCategories);
  if (!note) {
    note = `Thu nhập từ ${category}`;
  }

  return {
    amount,
    category,
    note,
  };
}

module.exports = {
  parseSmartNotepad,
  parseAmountToken,
  resolveCategory,
};
