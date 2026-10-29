require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const { getFacebookPageAccessToken } = require('../src/utils/FacebookPageAccessToken');

const PAGES = [
  { id: '1383891371465269', name: 'Đài truyền hình ABC' },
  { id: '1406154479236872', name: 'Một Câu Chuyện' }
];

async function verifyFeed() {
  for (const p of PAGES) {
    const pageToken = await getFacebookPageAccessToken(p.id);
    const feedRes = await axios.get(`https://graph.facebook.com/v19.0/${p.id}/feed`, {
      params: { access_token: pageToken, limit: 5, fields: 'id,created_time,message' }
    });
    console.log(`\n📰 Feed của ${p.name} (5 bài gần nhất, xác nhận quyền đọc feed thành công):`);
    for (const item of feedRes.data.data) {
      console.log(`- ID: ${item.id} | Ngày: ${item.created_time} | ${String(item.message || '').slice(0, 50).replace(/\n/g, ' ')}...`);
    }
  }
  process.exit(0);
}

verifyFeed().catch(e => { console.error(e.message); process.exit(1); });

