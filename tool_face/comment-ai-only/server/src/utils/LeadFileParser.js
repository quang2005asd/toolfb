const ExcelJS = require('exceljs');
const { parse: parseCsv } = require('csv-parse/sync');

const normVi = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

function cellValue(value) {
  if (value instanceof Date) return value;
  if (!value || typeof value !== 'object') return value ?? '';
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
  if (value.text !== undefined) return value.text;
  if (value.result !== undefined) return value.result;
  return '';
}

async function rowsFromBuffer(buffer, fileName) {
  const extension = String(fileName || '').toLowerCase().split('.').pop();
  if (extension === 'csv') {
    try {
      return parseCsv(buffer, { bom: true, relax_column_count: true, skip_empty_lines: false });
    } catch (error) {
      throw Object.assign(new Error(`Không đọc được file CSV: ${error.message}`), { status: 400 });
    }
  }
  if (extension === 'xls') {
    throw Object.assign(new Error('File .xls cũ chưa được hỗ trợ. Hãy lưu lại thành .xlsx hoặc .csv.'), { status: 400 });
  }
  if (extension && extension !== 'xlsx') {
    throw Object.assign(new Error('Chỉ hỗ trợ file .xlsx và .csv.'), { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (error) {
    throw Object.assign(new Error(`Không đọc được file Excel: ${error.message}`), { status: 400 });
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw Object.assign(new Error('File không có dữ liệu.'), { status: 400 });

  const data = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    data.push(row.values.slice(1).map(cellValue));
  });
  return data;
}

async function parseLeadSheet(buffer, fileName = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw Object.assign(new Error('File không có dữ liệu.'), { status: 400 });
  }
  const data = await rowsFromBuffer(buffer, fileName);
  const header = (data[0] || []).map(normVi);
  const find = (...keys) => header.findIndex((value) => keys.some((key) => value.includes(key)));
  const ix = {
    time: find('dau thoi gian', 'time', 'date'),
    group: find('group', 'nhom'),
    content: find('content', 'noi dung'),
    profile: find('profile', 'ho so'),
    post: find('link post', 'post', 'bai viet')
  };
  if (ix.content < 0) Object.assign(ix, { time: 0, group: 1, content: 2, post: 3, profile: 4 });
  if (ix.post === ix.profile) Object.assign(ix, { post: 3, profile: 4 });
  const rows = [];
  let blank = 0;

  for (const row of data.slice(1)) {
    const cell = (index) => (index < 0 ? '' : row[index]);
    const content = String(cell(ix.content) ?? '').trim();
    if (!content) {
      blank++;
      continue;
    }
    const time = cell(ix.time);
    const group = cell(ix.group);
    rows.push({
      time: time instanceof Date ? time.toISOString() : (time || ''),
      group: typeof group === 'number' ? String(Math.round(group)) : String(group || ''),
      content: content.slice(0, 4000),
      postUrl: String(cell(ix.post) || '').trim().slice(0, 500),
      profileUrl: String(cell(ix.profile) || '').trim().slice(0, 500)
    });
  }
  return { rows, blank };
}

module.exports = { parseLeadSheet };
