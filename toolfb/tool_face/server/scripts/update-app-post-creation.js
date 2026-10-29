const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../src/app.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Update PostStateMachine import in app.js
code = code.replace(
  "const { computePostHash, POST_STATES } = require('./utils/PostStateMachine');",
  "const { computePostHash, POST_STATES, isPageIdAllowed, prepareStandardPostInsert } = require('./utils/PostStateMachine');"
);

// 2. Add startup safety banner
if (!code.includes('[Safety Audit at Startup]')) {
  const listenSnippet = "console.log('Server listening on ' + port);";
  const banner = `console.log('Server listening on ' + port);
    console.log('🛡️ [Safety Audit at Startup]:');
    console.log('   - APP_ENV:', process.env.APP_ENV || 'development');
    console.log('   - ENABLE_FB_NATIVE_SCHEDULE:', process.env.ENABLE_FB_NATIVE_SCHEDULE || 'false');
    console.log('   - ALLOWED_PAGE_IDS:', process.env.ALLOWED_PAGE_IDS || '(EMPTY - FAIL CLOSED)');
    console.log('   - MAX_SCHEDULE_DELAY_MINUTES:', process.env.MAX_SCHEDULE_DELAY_MINUTES || '60');`;
  code = code.replace(listenSnippet, banner);
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('✅ Updated app.js imports and startup banner!');

