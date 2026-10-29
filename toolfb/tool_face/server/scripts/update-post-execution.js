const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../src/utils/PostExecutionService.js');
let code = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

code = code.replace(
  "const { transition, POST_STATES, assertPublishable } = require('./PostStateMachine');",
  "const { transition, POST_STATES, assertPublishable, isPageIdAllowed } = require('./PostStateMachine');"
);

const oldCheck = `  // Trong giai đoạn thử nghiệm: nếu ALLOWED_PAGE_IDS rỗng => TỪ CHỐI TẤT CẢ (Fail Closed)
  if (!isMockTestPage && (allowedPageIds.length === 0 || !allowedPageIds.includes(String(post.page_id)))) {`;

const newCheck = `  // Trong giai đoạn thử nghiệm: nếu ALLOWED_PAGE_IDS rỗng => TỪ CHỐI TẤT CẢ (Fail Closed)
  if (!isPageIdAllowed(post.page_id)) {`;

code = code.replace(oldCheck, newCheck);
fs.writeFileSync(filePath, code, 'utf8');
console.log('✅ Updated PostExecutionService.js to use isPageIdAllowed!');

