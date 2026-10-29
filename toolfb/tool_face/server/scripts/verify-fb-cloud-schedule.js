require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const { getFacebookPageAccessToken } = require('../src/utils/FacebookPageAccessToken');

const PAGES = [
  { id: '1383891371465269', name: 'Đài truyền hình ABC' },
  { id: '1406154479236872', name: 'Một Câu Chuyện' }
];

async function verifyPages() {
  console.log('🚀 KIỂM TRA TOÀN DIỆN GRAPH API TRÊN CÁC PAGE KHÁCH...');
  
  for (const p of PAGES) {
    console.log(`\n============================================================`);
    console.log(`🔎 KIỂM TRA FANPAGE: ${p.name} (ID: ${p.id})`);
    console.log(`============================================================`);
    
    try {
      const pageToken = await getFacebookPageAccessToken(p.id);
      
      // 1. Kiểm tra Page Token hợp lệ bằng GET /{page_id}
      const pageInfo = await axios.get(`https://graph.facebook.com/v19.0/${p.id}`, {
        params: { access_token: pageToken, fields: 'id,name,link' }
      });
      console.log(`✅ Token Page HOẠT ĐỘNG TỐT: ${pageInfo.data.name} (ID: ${pageInfo.data.id})`);

      // 2. Kiểm tra /scheduled_posts
      const schedRes = await axios.get(`https://graph.facebook.com/v19.0/${p.id}/scheduled_posts`, {
        params: { access_token: pageToken, fields: 'id,message,scheduled_publish_time,is_published' }
      });
      console.log(`📅 [scheduled_posts] Tổng số bài hẹn giờ trên Cloud: ${schedRes.data.data.length}`);
      if (schedRes.data.data.length > 0) {
        console.table(schedRes.data.data);
      } else {
        console.log(`   -> KHÔNG CÓ BÀI HẸN GIỜ NÀO TRÊN CLOUD CỦA ${p.name}!`);
      }

      // 3. Kiểm tra /promotable_posts?is_published=false
      const promoRes = await axios.get(`https://graph.facebook.com/v19.0/${p.id}/promotable_posts`, {
        params: { access_token: pageToken, is_published: false, fields: 'id,message,scheduled_publish_time,is_published' }
      });
      console.log(`📑 [promotable_posts?is_published=false] Số bài unpublished/lên lịch: ${promoRes.data.data.length}`);
      if (promoRes.data.data.length > 0) {
        console.table(promoRes.data.data);
      } else {
        console.log(`   -> KHÔNG CÓ BÀI UNPUBLISHED/LÊN LỊCH NÀO TRÊN CLOUD CỦA ${p.name}!`);
      }

      // 4. Kiểm tra /feed để đảm bảo token có toàn quyền đọc
      const feedRes = await axios.get(`https://graph.facebook.com/v19.0/${p.id}/feed`, {
        params: { access_token: pageToken, limit: 3, fields: 'id,created_time,message' }
      });
      console.log(`📰 [feed] 3 bài đăng gần nhất trên Page (Xác thực quyền đọc bài bình thường):`);
      for (const item of feedRes.data.data) {
        console.log(`   - ID: ${item.id} | Ngày: ${item.created_time} | ${String(item.message || '').slice(0, 40)}...`);
      }

    } catch (err) {
      console.error(`❌ Lỗi kiểm tra Page ${p.id}:`, err.response?.data || err.message);
    }
  }

  // 5. Kiểm tra trực tiếp đối tượng post #519 với Page Token của chính Page 1383891371465269
  console.log(`\n============================================================`);
  console.log(`🔎 TRUY VẤN TRỰC TIẾP ID BÀI #519 (1383891371465269_122116258779489187)`);
  console.log(`============================================================`);
  try {
    const pageToken = await getFacebookPageAccessToken('1383891371465269');
    const directRes = await axios.get(`https://graph.facebook.com/v19.0/1383891371465269_122116258779489187`, {
      params: { access_token: pageToken }
    });
    console.log(`⚠️ Bài vẫn còn:`, directRes.data);
  } catch (err) {
    console.log(`Kết quả trả về từ Graph API:`);
    console.log(`- HTTP Status:`, err.response?.status);
    console.log(`- Graph Error Data:`, JSON.stringify(err.response?.data?.error, null, 2));
  }

  process.exit(0);
}

verifyPages().catch(e => {
  console.error(e);
  process.exit(1);
});

