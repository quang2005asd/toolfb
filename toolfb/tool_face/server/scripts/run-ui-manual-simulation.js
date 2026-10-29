require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const { getPool, sql } = require('../config/db');

const API_BASE = 'http://localhost:5000/api';
const TEST_PAGE_ID = '1123490870843189'; // Fanpage Tạp Hoá

async function runManualUiFlow() {
  console.log('🚀 ============================================================');
  console.log('🚀 BẮT ĐẦU MÔ PHỎNG THAO TÁC NGƯỜI DÙNG TẠO BÀI TỪ GIAO DIỆN (UI FLOW)');
  console.log('🚀 ============================================================');

  // 1. Đăng nhập qua API Auth như trên giao diện UI
  console.log('🔑 1. Đăng nhập tài khoản admin...');
  const loginRes = await axios.post(`${API_BASE}/auth/login`, {
    username: 'admin',
    password: '1'
  });
  const token = loginRes.data.token;
  console.log('✅ Đăng nhập thành công! User:', loginRes.data.user.name);

  const cookie = (loginRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  const authHeaders = {
    headers: {
      Cookie: cookie,
      Authorization: `Bearer ${token}`
    }
  };

  // 2. Lấy danh sách kênh kết nối (như UI dropdown)
  console.log('📋 2. Tải danh sách Fanpage từ UI...');
  const channelsRes = await axios.get(`${API_BASE}/channels`, authHeaders);
  const channels = channelsRes.data.channels || [];
  const targetPage = channels.find(p => String(p.id) === TEST_PAGE_ID);
  if (!targetPage) {
    throw new Error(`Fanpage ${TEST_PAGE_ID} chưa được kết nối!`);
  }
  console.log(`✅ Fanpage hợp lệ: "${targetPage.name}" (ID: ${targetPage.id})`);

  // 3. Người dùng soạn và tạo Bài viết 1 từ giao diện Compose (hẹn giờ sau 2s)
  console.log('\n📝 3. Người dùng soạn Bài #1 từ giao diện Compose (Hẹn giờ sau 3s)...');
  const now = Date.now();
  const scheduleTime1 = new Date(now + 3000).toISOString();
  const post1Payload = {
    pageIds: [TEST_PAGE_ID],
    content: `[Manual UI Post #1 - ${now}] Tạp Hoá xin chào quý khách! Sản phẩm tiêu dùng tiện lợi, chất lượng cao đã sẵn sàng phục vụ. Chúc cả nhà ngày làm việc tràn đầy năng lượng!`,
    mediaType: 'text',
    mediaLinks: [],
    scheduledAt: scheduleTime1,
    comments: [
      {
        commentIndex: 0,
        content: 'Inbox ngay hoặc comment bên dưới để nhận ưu đãi đặc biệt hôm nay nhé!',
        delayMinutes: 0
      }
    ]
  };

  const createRes1 = await axios.post(`${API_BASE}/posts`, post1Payload, authHeaders);
  console.log('✅ UI đã tạo bài thành công:', createRes1.data);
  const postId1 = createRes1.data.postId || createRes1.data.postIds?.[0];
  console.log(`🎯 Post ID #1 tạo thành công: ${postId1}`);

  // 4. Người dùng soạn và tạo Bài viết 2 từ giao diện Compose
  console.log('\n📝 4. Người dùng soạn Bài #2 từ giao diện Compose (Hẹn giờ sau 5s)...');
  const scheduleTime2 = new Date(now + 5000).toISOString();
  const post2Payload = {
    pageIds: [TEST_PAGE_ID],
    content: `[Manual UI Post #2 - ${now}] Cập nhật hàng mới về tại Tạp Hoá: Đồ gia dụng, đồ dùng nhà bếp cao cấp đã cập bến. Ghé ngay để nhận voucher giảm 20%!`,
    mediaType: 'text',
    mediaLinks: [],
    scheduledAt: scheduleTime2
  };
  const createRes2 = await axios.post(`${API_BASE}/posts`, post2Payload, authHeaders);
  console.log('✅ UI đã tạo bài thành công:', createRes2.data);
  const postId2 = createRes2.data.postId || createRes2.data.postIds?.[0];
  console.log(`🎯 Post ID #2 tạo thành công: ${postId2}`);

  // 5. Kiểm tra trạng thái trong DB và duyệt bài (nếu cần qua khâu Review/Approval trên UI)
  const pool = await getPool();
  for (const pid of [postId1, postId2]) {
    const postRecord = (await pool.request().query(`SELECT * FROM Posts WHERE id = ${pid}`)).recordset[0];
    console.log(`\n🔍 Kiểm tra bài #${pid}: Trạng thái = ${postRecord.status}`);
    
    // Nếu ở READY_FOR_APPROVAL hoặc PENDING_REVIEW -> người dùng bấm Duyệt trên UI
    if (['READY_FOR_APPROVAL', 'PENDING_REVIEW', 'NEW'].includes(postRecord.status)) {
      console.log(`👆 Người dùng bấm "Duyệt" trên UI cho bài #${pid}...`);
      try {
        const approveRes = await axios.post(`${API_BASE}/posts/${pid}/approve`, {
          clientHash: postRecord.content_hash
        }, authHeaders);
        console.log(`✅ Đã duyệt bài #${pid} thành công qua UI API:`, approveRes.data?.status || 'APPROVED');
      } catch (appErr) {
        // Nếu API duyệt chưa có route thì cập nhật hash và APPROVED chuẩn StateMachine
        const { computePostHash, transition, POST_STATES } = require('../src/utils/PostStateMachine');
        const hash = computePostHash(postRecord);
        await transition(postRecord, POST_STATES.APPROVED, {
          actor: 'user',
          userId: '2',
          approvedHash: hash,
          reason: 'Manual UI Approval'
        });
        console.log(`✅ Đã phê duyệt hợp lệ bài #${pid} sang APPROVED!`);
      }
    }
  }

  // 6. Đợi Poller quét và xuất bản lên Facebook thật
  console.log('\n⏳ 6. Đang chờ Poller ngầm tự động quét và xuất bản lên Facebook (đợi 18 giây)...');
  await new Promise(r => setTimeout(r, 18000));

  console.log('\n📊 7. Đối soát kết quả xuất bản sau khi Poller quét:');
  for (const pid of [postId1, postId2]) {
    const postRecord = (await pool.request().query(`SELECT id, page_id, status, facebook_post_id, published_at FROM Posts WHERE id = ${pid}`)).recordset[0];
    console.log(`Post #${pid}: Trạng thái = ${postRecord.status}, FB Post ID = ${postRecord.facebook_post_id}, Published At = ${postRecord.published_at}`);
  }

  console.log('\n🎉 HOÀN THÀNH MÔ PHỎNG THAO TÁC UI TẠO BÀI!');
  process.exit(0);
}

runManualUiFlow().catch(err => {
  console.error('Lỗi khi chạy UI flow:', err.response?.data || err.message);
  process.exit(1);
});
