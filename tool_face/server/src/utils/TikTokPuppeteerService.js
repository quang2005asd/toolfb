/**
 * TikTokPuppeteerService.js
 * Tự động đăng video lên TikTok bằng Puppeteer & Cookie (Cách 2)
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { getTikTokAccountById } = require('./TikTokService');
const { sql, getPool } = require('../../config/db');

// Kích hoạt plugin chống phát hiện bot
puppeteer.use(StealthPlugin());

/**
 * Xóa file an toàn – không throw nếu file không tồn tại hoặc đang bị dùng
 * @param {string} filePath
 * @param {string} [label] - Nhãn log
 */
function safeDeleteFile(filePath, label = '') {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️  [TikTok Cleanup${label ? ' ' + label : ''}] Đã xóa file: ${path.basename(filePath)}`);
    }
  } catch (err) {
    console.warn(`[TikTok Cleanup] Không thể xóa ${filePath}:`, err.message);
  }
}

/**
 * Tìm đường dẫn trình duyệt Chrome hoặc Edge có sẵn trên hệ điều hành
 */
function getBrowserExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // Trên Windows: ưu tiên Google Chrome, sau đó Microsoft Edge
  const windowsPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];

  for (const p of windowsPaths) {
    if (fs.existsSync(p)) return p;
  }

  // Trên Linux / Docker container
  const linuxPaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome'
  ];

  for (const p of linuxPaths) {
    if (fs.existsSync(p)) return p;
  }

  return undefined; // Puppeteer sẽ dùng Chromium tải về mặc định
}

function getUploadFilePath(fileName) {
  if (process.env.APP_DATA_DIR) {
    const p = path.join(process.env.APP_DATA_DIR, 'uploads', fileName);
    if (fs.existsSync(p)) return p;
  }
  const p2 = path.resolve(__dirname, '../../uploads', fileName);
  if (fs.existsSync(p2)) return p2;
  return process.env.APP_DATA_DIR ? path.join(process.env.APP_DATA_DIR, 'uploads', fileName) : p2;
}

/**
 * Chuẩn bị file video từ đường dẫn (hỗ trợ local:// hoặc link mạng)
 */
async function prepareVideoFile(mediaLink) {
  if (!mediaLink) throw new Error('Không tìm thấy đường dẫn video.');

  const isLocalUpload = typeof mediaLink === 'string' && mediaLink.startsWith('local://');
  if (isLocalUpload) {
    const fileName = mediaLink.slice('local://'.length);
    const filePath = getUploadFilePath(fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Tệp video nội bộ ${fileName} không tồn tại trên máy chủ.`);
    }
    return { filePath, isTemp: false };
  }

  // Nếu là đường dẫn URL, tải về thư mục tạm
  console.log(`📥 [TikTok Video] Đang tải video từ URL: ${mediaLink}`);
  const tempDir = path.resolve(__dirname, '../../uploads/temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const tempFileName = `tiktok_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`;
  const tempFilePath = path.join(tempDir, tempFileName);

  const response = await axios({
    method: 'GET',
    url: mediaLink,
    responseType: 'stream',
    timeout: 120000
  });

  const writer = fs.createWriteStream(tempFilePath);
  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  return { filePath: tempFilePath, isTemp: true };
}

/**
 * Dọn dẹp thư mục uploads/temp: xóa mọi file tạm quá tuổi (mặc định 2 giờ)
 * Gọi định kỳ từ app.js khi server khởi động để tránh ổ cứng đầy.
 * @param {number} [maxAgeMs=7200000] - Tuổi tối đa (ms). Mặc định 2 giờ.
 */
async function cleanupTempUploads(maxAgeMs = 2 * 60 * 60 * 1000) {
  const tempDir = process.env.APP_DATA_DIR
    ? path.join(process.env.APP_DATA_DIR, 'uploads', 'temp')
    : path.resolve(__dirname, '../../uploads/temp');

  if (!fs.existsSync(tempDir)) return;

  let deleted = 0;
  let freed = 0;
  const now = Date.now();

  try {
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && (now - stat.mtimeMs) > maxAgeMs) {
          freed += stat.size;
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch (_) {}
    }
    if (deleted > 0) {
      const freedMb = (freed / (1024 * 1024)).toFixed(1);
      console.log(`🧹 [TikTok Temp Cleanup] Đã xóa ${deleted} file tạm cũ, giải phóng ${freedMb} MB ổ cứng.`);
    }
  } catch (err) {
    console.warn('[TikTok Temp Cleanup Error]', err.message);
  }
}

/**
 * Tự động đăng video lên TikTok bằng Puppeteer
 */
async function uploadVideoToTikTok({ tiktokAccountId, mediaLink, caption }) {
  console.log(`🎬 [TikTok Puppeteer] Bắt đầu xử lý đăng video cho tài khoản #${tiktokAccountId}...`);

  const account = await getTikTokAccountById(tiktokAccountId);
  if (!account) {
    throw new Error(`Không tìm thấy tài khoản TikTok #${tiktokAccountId} trong hệ thống.`);
  }

  let cookiesArray = [];
  try {
    cookiesArray = JSON.parse(account.cookies_json);
  } catch (_) {
    throw new Error('Dữ liệu Cookie của tài khoản TikTok bị lỗi.');
  }

  if (!cookiesArray || cookiesArray.length === 0) {
    throw new Error('Tài khoản TikTok chưa có Cookie.');
  }

  const { filePath, isTemp } = await prepareVideoFile(mediaLink);
  let browser = null;

  try {
    const executablePath = getBrowserExecutablePath();
    console.log(`🌐 [TikTok Puppeteer] Khởi động trình duyệt: ${executablePath || 'Chromium mặc định'}`);

    browser = await puppeteer.launch({
      headless: process.env.PUPPETEER_HEADLESS === 'false' ? false : 'new',
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--window-size=1280,800'
      ],
      defaultViewport: { width: 1280, height: 800 }
    });

    const page = await browser.newPage();

    // Định dạng lại cookie cho Puppeteer
    const formattedCookies = cookiesArray.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain?.startsWith('.') ? c.domain : `.${c.domain || 'tiktok.com'}`,
      path: c.path || '/'
    }));

    await page.setCookie(...formattedCookies);
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    );

    console.log('🔗 [TikTok Puppeteer] Đang truy cập trang TikTok Studio Upload...');
    // TikTok Studio Upload URL
    await page.goto('https://www.tiktok.com/tiktokstudio/upload?from=upload', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Kiểm tra nếu bị redirect sang trang login -> Cookie hết hạn
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('passport.tiktok.com')) {
      throw new Error('Cookie TikTok đã hết hạn hoặc không có quyền truy cập. Vui lòng cập nhật Cookie mới.');
    }

    console.log('📂 [TikTok Puppeteer] Đang tìm ô tải file video...');
    // Tìm thẻ input[type="file"] trên trang chính hoặc trong iframe
    let uploadInput = null;
    try {
      uploadInput = await page.waitForSelector('input[type="file"]', { timeout: 15000 });
    } catch (_) {
      // Tìm trong các frame con nếu có
      for (const frame of page.frames()) {
        try {
          uploadInput = await frame.$('input[type="file"]');
          if (uploadInput) break;
        } catch (_) {}
      }
    }

    if (!uploadInput) {
      // Dự phòng: thử điều hướng sang https://www.tiktok.com/creator-center/upload
      console.log('🔄 Thử chuyển sang Creator Center...');
      await page.goto('https://www.tiktok.com/creator-center/upload', {
        waitUntil: 'networkidle2',
        timeout: 45000
      });
      uploadInput = await page.waitForSelector('input[type="file"]', { timeout: 20000 });
    }

    if (!uploadInput) {
      throw new Error('Không tìm thấy khung tải file video trên giao diện TikTok.');
    }

    console.log(`⬆️ [TikTok Puppeteer] Đang upload tệp: ${filePath}`);
    await uploadInput.uploadFile(filePath);

    const uploadsDir = process.env.APP_DATA_DIR
      ? path.join(process.env.APP_DATA_DIR, 'uploads')
      : path.resolve(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (_) {}
    }

    const takeDebugPic = async (label) => {
      try {
        const p = path.join(uploadsDir, `tiktok_debug_${label}.png`);
        await page.screenshot({ path: p, fullPage: true });
        console.log(`📸 [Screenshot] Đã lưu: /uploads/tiktok_debug_${label}.png`);
      } catch (_) {}
    };

    // Hàm tự động đóng các popup/modal chặn màn hình (Got it, Turn on, Bật, Đã hiểu... TUYỆT ĐỐI không click Cancel)
    const dismissAllPopups = async () => {
      try {
        const actions = await page.evaluate(() => {
          const act = [];
          const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
          for (const b of allButtons) {
            const t = (b.innerText || b.textContent || '').trim().toLowerCase();
            // Nếu có hộp thoại hỏi "Sure you want to cancel your upload?" -> BẮT BUỘC bấm "No"
            if (t === 'no' || t === 'không') {
              b.click();
              act.push('Dismiss Cancel Prompt (No)');
            }
            // Các popup hướng dẫn / gợi ý / bật tính năng của TikTok Studio
            if (
              t === 'turn on' || t === 'got it' || t === 'bật' || t === 'đã hiểu' ||
              t === 'not now' || t === 'để sau' || t === 'close' || t === 'đóng' ||
              t === 'dismiss' || t === 'bỏ qua'
            ) {
              b.click();
              act.push(t);
            }
          }
          return act;
        });
        if (actions && actions.length > 0) {
          console.log(`🧹 [TikTok Puppeteer] Đã xử lý popup: ${actions.join(', ')}`);
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (_) {}
    };

    // Chờ 6 giây đầu tiên sau khi nạp file để TikTok xử lý upload ban đầu
    console.log('⏳ [TikTok Puppeteer] Đang chờ TikTok nạp video và hiển thị chi tiết...');
    await new Promise((r) => setTimeout(r, 6000));
    await dismissAllPopups();
    await takeDebugPic('1_after_upload');

    // Điền Caption / Nội dung bài viết
    if (caption) {
      console.log('✍️ [TikTok Puppeteer] Đang nhập nội dung bài viết...');
      try {
        await dismissAllPopups();
        const captionSelector = [
          'div[contenteditable="true"]',
          'div[role="combobox"]',
          '.DraftEditor-root [contenteditable="true"]',
          'div[data-placeholder]',
          'textarea'
        ].join(', ');

        const captionElem = await page.waitForSelector(captionSelector, { timeout: 15000 });
        if (captionElem) {
          await captionElem.click();
          await page.keyboard.down('Control');
          await page.keyboard.press('A');
          await page.keyboard.up('Control');
          await page.keyboard.press('Backspace');
          await page.keyboard.type(caption, { delay: 20 });
          // Click ra ngoài để xác nhận nội dung
          await page.mouse.click(10, 10);
        }
      } catch (captionErr) {
        console.warn('⚠️ [TikTok Puppeteer] Không thể điền caption:', captionErr.message);
      }
    }

    // Cuộn xuống cuối trang để hiển thị khu vực nút Đăng
    await dismissAllPopups();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((r) => setTimeout(r, 2000));
    await takeDebugPic('2_scrolled_to_bottom');

    // Chờ cho đến khi video upload xong và nút "Post" SẴN SÀNG (không bị disabled)
    console.log('⏳ [TikTok Puppeteer] Đang đợi video tải lên hoàn tất và nút Đăng kích hoạt...');
    let postButtonReady = false;
    const maxWaitSeconds = 90;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitSeconds * 1000) {
      await dismissAllPopups();

      const btnStatus = await page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        const postBtns = allButtons.filter(b => {
          const t = (b.innerText || b.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
          return t === 'post' || t === 'đăng' || t === 'post video' || t === 'đăng video' || t === 'publish' || t === 'xuất bản';
        });

        if (postBtns.length === 0) return { exists: false };

        const btn = postBtns[0];
        const disabled = btn.disabled || 
                         btn.getAttribute('aria-disabled') === 'true' || 
                         btn.classList.contains('disabled') || 
                         btn.hasAttribute('disabled');

        return {
          exists: true,
          disabled,
          text: (btn.innerText || btn.textContent || '').trim()
        };
      });

      if (btnStatus && btnStatus.exists) {
        if (!btnStatus.disabled) {
          console.log(`🎯 [TikTok Puppeteer] Nút "${btnStatus.text}" đã sẵn sàng!`);
          postButtonReady = true;
          break;
        } else {
          console.log('⏳ Video đang tải lên hoặc TikTok đang kiểm tra bản quyền (nút Đăng đang chờ kích hoạt)...');
        }
      }

      await new Promise((r) => setTimeout(r, 3000));
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    }

    await takeDebugPic('3_before_click_post');

    if (!postButtonReady) {
      throw new Error('Video chưa xử lý xong hoặc nút Đăng không kích hoạt sau 90 giây.');
    }

    console.log('🚀 [TikTok Puppeteer] Đang bấm nút Đăng bài (Post)...');
    const clickSuccess = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
      const postBtn = allButtons.find(b => {
        const t = (b.innerText || b.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
        return t === 'post' || t === 'đăng' || t === 'post video' || t === 'đăng video' || t === 'publish' || t === 'xuất bản';
      });

      if (postBtn && !postBtn.disabled) {
        postBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
        postBtn.click();
        postBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        postBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        postBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      }
      return false;
    });

    if (!clickSuccess) {
      throw new Error('Không thể kích hoạt sự kiện click vào nút Đăng bài.');
    }

    console.log('✅ [TikTok Puppeteer] Đã bấm nút Đăng! Chờ xác nhận và xử lý popup tiếp theo...');
    await new Promise((r) => setTimeout(r, 5000));
    await takeDebugPic('4_after_click_post');

    // Xử lý các Popup/Modal xác nhận nếu TikTok bật (ví dụ: "Continue to post? -> Post now", "Post anyway", bản quyền...)
    for (let i = 0; i < 8; i++) {
      const modalHandled = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        for (const b of buttons) {
          const t = (b.innerText || b.textContent || '').trim().toLowerCase();
          if (
            t === 'post now' ||
            t === 'đăng ngay' ||
            t.includes('post now') ||
            t.includes('post anyway') ||
            t.includes('continue to post') ||
            t.includes('tiếp tục đăng') ||
            t.includes('continue') ||
            t.includes('tiếp tục') ||
            t.includes('confirm') ||
            t.includes('xác nhận')
          ) {
            b.click();
            b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            return (b.innerText || b.textContent || '').trim();
          }
        }
        return null;
      });

      if (modalHandled) {
        console.log(`🔔 [TikTok Puppeteer] Đã bấm xác nhận hộp thoại modal: "${modalHandled}"`);
        await new Promise((r) => setTimeout(r, 4000));
      } else {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Chờ TikTok xử lý tải lên và thông báo thành công (tối đa 45s)
    console.log('⏳ [TikTok Puppeteer] Chờ TikTok xác nhận xuất bản video thành công...');
    let uploadConfirmed = false;
    for (let c = 0; c < 15; c++) {
      await new Promise((r) => setTimeout(r, 3000));
      await dismissAllPopups();

      // Kiểm tra nếu popup "Post now" vẫn còn hoặc mới xuất hiện
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        for (const b of buttons) {
          const t = (b.innerText || b.textContent || '').trim().toLowerCase();
          if (t === 'post now' || t.includes('post now') || t.includes('post anyway')) {
            b.click();
          }
        }
      });

      const pageInfo = await page.evaluate(() => {
        const text = document.body.innerText || '';
        const hasSuccessText = text.includes('Video của bạn đã được tải lên') ||
                               text.includes('Your video has been uploaded') ||
                               text.includes('Đã tải lên') ||
                               text.includes('Quản lý bài đăng') ||
                               text.includes('Manage your posts') ||
                               text.includes('Tải video khác lên') ||
                               text.includes('Upload another video') ||
                               text.includes('View profile') ||
                               text.includes('Xem hồ sơ');
        return {
          hasSuccessText,
          url: window.location.href
        };
      });

      if (pageInfo.hasSuccessText || pageInfo.url.includes('/content') || pageInfo.url.includes('/manage')) {
        console.log('🎉 [TikTok Puppeteer] Xác nhận video đã được xuất bản lên TikTok thành công!');
        uploadConfirmed = true;
        break;
      }
    }

    await takeDebugPic('5_final_result');

    if (!uploadConfirmed) {
      throw new Error('TikTok chưa xác nhận xuất bản video thành công sau khi bấm Post. Vui lòng kiểm tra ảnh debug.');
    }

    return {
      success: true,
      message: 'Đăng video lên TikTok hoàn tất thành công 100%!'
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    // Dọn dẹp file video tạm nếu đã tải từ URL về thư mục temp
    if (isTemp && fs.existsSync(filePath)) {
      safeDeleteFile(filePath, 'URL temp');
    }
  }
}

/**
 * executePublishTikTokPost: Thực thi xuất bản bài viết TikTok được gọi từ Queue / Scheduler
 * Sau khi đăng xong, TỰ ĐỘNG XÓA file video đã upload lên server để giải phóng ổ cứng.
 */
async function executePublishTikTokPost(postId) {
  console.log(`🚀 [TIKTOK WORKER] Bắt đầu xuất bản Post ID: #${postId}`);
  const pool = await getPool();

  const postQuery = await pool.request()
    .input('id', sql.Int, postId)
    .query('SELECT * FROM Posts WHERE id = @id');

  const post = postQuery.recordset[0];
  if (!post) {
    console.log(`Bài viết #${postId} không tồn tại.`);
    return;
  }

  if (post.status === 'published' || post.status === 'cancelled') {
    return;
  }

  const claimResult = await pool.request()
    .input('id', sql.Int, postId)
    .query("UPDATE Posts SET status = 'publishing' OUTPUT INSERTED.id WHERE id = @id AND status IN ('pending', 'scheduled', 'queued')");
  if (claimResult.recordset.length === 0) return;

  try {
    let mediaLinks = [];
    if (post.media_links) {
      try {
        const parsed = JSON.parse(post.media_links);
        mediaLinks = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        mediaLinks = String(post.media_links).split(',').map((l) => l.trim()).filter(Boolean);
      }
    }

    const videoUrl = mediaLinks[0];
    if (!videoUrl) {
      throw new Error('Bài đăng TikTok bắt buộc phải có video.');
    }

    const tiktokAccountId = post.tiktok_account_id || post.page_id;
    if (!tiktokAccountId) {
      throw new Error('Chưa chọn tài khoản TikTok để đăng bài.');
    }

    await uploadVideoToTikTok({
      tiktokAccountId,
      mediaLink: videoUrl,
      caption: post.content
    });

    const nowIso = new Date().toISOString();
    await pool.request()
      .input('id', sql.Int, postId)
      .input('nowIso', sql.NVarChar, nowIso)
      .query(`
        UPDATE Posts 
        SET status = 'published', 
            published_at = @nowIso, 
            updated_at = @nowIso 
        WHERE id = @id
      `);

    console.log(`🎉 [TIKTOK SUCCESS] Xuất bản bài #${postId} lên TikTok thành công!`);

    // ── Tự động xóa file video đã upload lên server để giải phóng ổ cứng ────
    // Chỉ xóa nếu là file local:// (file user đã upload lên server của mình)
    // Không xóa nếu là link ngoài (Google Drive, URL) vì không chiếm ổ cứng server
    if (videoUrl && typeof videoUrl === 'string' && videoUrl.startsWith('local://')) {
      const localFileName = videoUrl.slice('local://'.length);
      const uploadsDir = process.env.APP_DATA_DIR
        ? path.join(process.env.APP_DATA_DIR, 'uploads')
        : path.resolve(__dirname, '../../uploads');
      const localFilePath = path.join(uploadsDir, path.basename(localFileName));
      // Delay nhỏ để đảm bảo browser đã hoàn toàn đóng và giải phóng file
      setTimeout(() => safeDeleteFile(localFilePath, 'local after publish'), 5000);
    }

  } catch (err) {
    console.error(`💥 [TIKTOK ERROR] Xuất bản bài #${postId} thất bại:`, err.message);
    await pool.request()
      .input('id', sql.Int, postId)
      .query("UPDATE Posts SET status = 'failed' WHERE id = @id");
    throw err;
  }
}

module.exports = {
  uploadVideoToTikTok,
  executePublishTikTokPost,
  cleanupTempUploads
};
