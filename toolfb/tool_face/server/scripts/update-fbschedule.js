const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../src/utils/FacebookScheduleService.js');
let code = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

if (!code.includes("const { isPageIdAllowed } = require('./PostStateMachine');")) {
  code = "const { isPageIdAllowed } = require('./PostStateMachine');\n" + code;
}

const oldBlock = `  // 2. Chặn whitelist: Bắt buộc phải có pageId và pageId phải thuộc ALLOWED_PAGE_IDS
  if (!pageId) {
    return false;
  }
  const allowedPageIds = (process.env.ALLOWED_PAGE_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const isProduction = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
  const isMock = !isProduction && (
    String(pageId).startsWith('SYSTEM_TEST_') || 
    String(pageId).startsWith('page_') || 
    String(pageId).startsWith('tiktok_')
  );
  if (!isMock && (allowedPageIds.length === 0 || !allowedPageIds.includes(String(pageId)))) {
    return false;
  }`;

const newBlock = `  // 2. Chặn whitelist: Bắt buộc phải có pageId và pageId phải thuộc ALLOWED_PAGE_IDS (Fail-Closed)
  if (!isPageIdAllowed(pageId)) {
    return false;
  }`;

code = code.replace(oldBlock, newBlock);
fs.writeFileSync(filePath, code, 'utf8');
console.log('✅ Updated FacebookScheduleService.js with isPageIdAllowed!');

