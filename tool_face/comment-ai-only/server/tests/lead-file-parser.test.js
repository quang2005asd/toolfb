const assert = require('node:assert/strict');
const test = require('node:test');
const ExcelJS = require('exceljs');
const { parseLeadSheet } = require('../src/utils/LeadFileParser');

test('parses the supported CSV format and counts blank rows', async () => {
  const csv = Buffer.from('Dấu thời gian,Groups,Contents,Link Posts,Link Profiles\n2025-01-02,Nhóm A,Cần tìm nhà cung cấp,https://example.com/post,https://example.com/user\n,,,,\n', 'utf8');
  const result = await parseLeadSheet(csv, 'leads.csv');

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].group, 'Nhóm A');
  assert.equal(result.rows[0].content, 'Cần tìm nhà cung cấp');
  assert.equal(result.rows[0].postUrl, 'https://example.com/post');
  assert.equal(result.blank, 1);
});

test('parses the supported XLSX format', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Leads');
  sheet.addRow(['Groups', 'Contents', 'Link Posts', 'Link Profiles']);
  sheet.addRow(['Nhóm B', 'Bên em chuyên thiết kế', 'https://example.com/post-b', 'https://example.com/user-b']);
  const xlsx = await workbook.xlsx.writeBuffer();
  const result = await parseLeadSheet(Buffer.from(xlsx), 'leads.xlsx');

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].group, 'Nhóm B');
  assert.equal(result.rows[0].content, 'Bên em chuyên thiết kế');
  assert.equal(result.rows[0].profileUrl, 'https://example.com/user-b');
});

test('rejects legacy XLS files with a useful message', async () => {
  await assert.rejects(
    parseLeadSheet(Buffer.from('legacy'), 'leads.xls'),
    { message: 'File .xls cũ chưa được hỗ trợ. Hãy lưu lại thành .xlsx hoặc .csv.' }
  );
});
