require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const assert = require('assert');
const axios = require('axios');
const { getPool, sql } = require('../config/db');
const { POST_STATES } = require('../src/utils/PostStateMachine');

const API_BASE = 'http://localhost:5000/api';
const VALID_PAGE_ID = '1123490870843189'; // Fanpage Tạp Hoá (Trong Whitelist)
const FORBIDDEN_PAGE_ID = '1383891371465269'; // Đài truyền hình ABC (Ngoài Whitelist)

async function testRealRoutes() {
  console.log('🧪 ============================================================');
  console.log('🧪 KIỂM THỬ THỰC TẾ ROUTE HTTP: POST & PUT /api/posts/:id');
  console.log('🧪 ============================================================');

  const pool = await getPool();
  const createdPostIds = [];

  try {
    // 1. Đăng nhập qua route HTTP thật để lấy session cookie + JWT
    console.log('\n🔑 1. Đăng nhập qua HTTP POST /api/auth/login...');
    const loginRes = await axios.post(`${API_BASE}/auth/login`, {
      username: 'admin',
      password: '1'
    });
    assert.strictEqual(loginRes.status, 200, 'Đăng nhập phải trả về 200 OK');
    const token = loginRes.data.token;
    const cookie = (loginRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    const authHeaders = {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: cookie
      }
    };
    console.log('✅ Đăng nhập thành công! User:', loginRes.data.user.name);

    // 2. Test POST /api/posts với Page ngoài Whitelist -> Phải trả về 403 Forbidden
    console.log('\n▶️ 2. Test route thật: POST /api/posts với Page ngoài Whitelist...');
    let postForbiddenError = null;
    try {
      await axios.post(`${API_BASE}/posts`, {
        pageIds: [FORBIDDEN_PAGE_ID],
        content: 'Thử tạo bài trên Page ngoài Whitelist qua HTTP',
        mediaType: 'text',
        mediaLinks: []
      }, authHeaders);
    } catch (err) {
      postForbiddenError = err.response;
    }
    assert(postForbiddenError, 'Phải từ chối tạo bài cho Page ngoài Whitelist');
    assert.strictEqual(postForbiddenError.status, 403, 'Mã HTTP phải là 403 Forbidden');
    assert.strictEqual(postForbiddenError.data.code, 'PAGE_NOT_ALLOWED', 'Code phải là PAGE_NOT_ALLOWED');
    console.log(`✅ PASSED (Route POST): Server từ chối ngay lập tức với mã 403 Forbidden! Lý do: "${postForbiddenError.data.message}"`);

    // 3. Test POST /api/posts với Page hợp lệ -> Phải tạo thành công (202 Accepted)
    console.log('\n▶️ 3. Test route thật: POST /api/posts với Page hợp lệ...');
    const now = Date.now();
    const createRes = await axios.post(`${API_BASE}/posts`, {
      pageIds: [VALID_PAGE_ID],
      content: `[HTTP Test Post #1 - ${now}] Kiểm tra tạo bài qua route`,
      mediaType: 'text',
      mediaLinks: [],
      scheduledAt: new Date(now + 300000).toISOString()
    }, authHeaders);
    assert.strictEqual(createRes.status, 202, 'Tạo bài hợp lệ phải trả về 202 Accepted');
    const postId = createRes.data.postId;
    assert(postId, 'Phải có postId trả về');
    createdPostIds.push(postId);
    console.log(`✅ PASSED (Route POST): Đã tạo bài #${postId} thành công qua route HTTP thật!`);

    // 4. Test route thật: PUT /api/posts/:id đổi sang Page ngoài Whitelist -> Phải bị 403
    console.log('\n▶️ 4. Test route thật: PUT /api/posts/:id đổi sang Page ngoài Whitelist...');
    let putForbiddenError = null;
    try {
      await axios.put(`${API_BASE}/posts/${postId}`, {
        pageId: FORBIDDEN_PAGE_ID,
        content: 'Cố tình đổi sang Page ngoài Whitelist khi sửa bài'
      }, authHeaders);
    } catch (err) {
      putForbiddenError = err.response;
    }
    assert(putForbiddenError, 'Phải từ chối sửa bài sang Page ngoài Whitelist');
    assert.strictEqual(putForbiddenError.status, 403, 'Mã HTTP sửa bài đổi page lạ phải là 403 Forbidden');
    assert.strictEqual(putForbiddenError.data.code, 'PAGE_NOT_ALLOWED', 'Code lỗi phải là PAGE_NOT_ALLOWED');
    console.log(`✅ PASSED (Route PUT): Server từ chối sửa bài đổi Page lạ với mã 403 Forbidden! Lý do: "${putForbiddenError.data.message}"`);

    // 5. Test route thật: PUT /api/posts/:id sửa nội dung bài đã duyệt -> Phải Anti-Tamper tước duyệt
    console.log('\n▶️ 5. Test route thật: PUT /api/posts/:id sửa nội dung bài đã duyệt...');
    const putEditRes = await axios.put(`${API_BASE}/posts/${postId}`, {
      content: `[HTTP Test Post #1 - ${now}] Nội dung ĐÃ BỊ SỬA LẠI sau khi duyệt!`
    }, authHeaders);
    assert.strictEqual(putEditRes.status, 200, 'Sửa bài hợp lệ phải trả về 200 OK');
    assert.strictEqual(putEditRes.data.invalidated, true, 'Sửa nội dung phải kích hoạt cơ chế invalidated = true');
    assert.strictEqual(putEditRes.data.status, POST_STATES.READY_FOR_APPROVAL, 'Trạng thái bài phải tự động hạ về READY_FOR_APPROVAL');
    
    // Kiểm tra trực tiếp trong DB
    const postInDb = (await pool.request().query(`SELECT * FROM Posts WHERE id = ${postId}`)).recordset[0];
    assert.strictEqual(postInDb.approved_hash, null, 'approved_hash trong DB phải bị tước bỏ về null');
    assert.strictEqual(postInDb.approved_by, null, 'approved_by trong DB phải bị xóa về null');
    console.log(`✅ PASSED (Route PUT Anti-Tamper): Sửa bài thành công, hệ thống tự động tước duyệt và hạ về READY_FOR_APPROVAL!`);

    // 6. Test route thật: PUT /api/posts/:id chặn sửa bài khi đang PUBLISHING
    console.log('\n▶️ 6. Test route thật: PUT /api/posts/:id chặn sửa bài đang PUBLISHING...');
    await pool.request().query(`UPDATE Posts SET status = '${POST_STATES.PUBLISHING}' WHERE id = ${postId}`);
    let putPublishingError = null;
    try {
      await axios.put(`${API_BASE}/posts/${postId}`, {
        content: 'Cố tình sửa bài khi worker đang gọi Graph API'
      }, authHeaders);
    } catch (err) {
      putPublishingError = err.response;
    }
    assert(putPublishingError, 'Phải chặn sửa bài khi đang PUBLISHING');
    assert.strictEqual(putPublishingError.status, 400, 'Mã HTTP phải là 400 Bad Request');
    console.log(`✅ PASSED (Route PUT Concurrency Guard): Chặn sửa bài đang PUBLISHING thành công với mã 400! Lý do: "${putPublishingError.data.message}"`);

  } finally {
    // 7. Dọn dẹp dữ liệu test
    if (createdPostIds.length > 0) {
      await pool.request().query(`DELETE FROM Posts WHERE id IN (${createdPostIds.join(',')})`);
      console.log(`\n🧹 Đã dọn dẹp các bản ghi test (${createdPostIds.join(', ')}) trong CSDL.`);
    }
  }

  console.log('\n============================================================');
  console.log('📊 KẾT QUẢ KIỂM THỬ ROUTE THẬT: 5/5 CA THÀNH CÔNG (100% PASS)');
  console.log('============================================================');
  process.exit(0);
}

testRealRoutes().catch(err => {
  console.error('❌ TEST FAILED:', err.response?.data || err.message);
  process.exit(1);
});

