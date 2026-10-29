require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const { getFacebookPageAccessToken } = require('../src/utils/FacebookPageAccessToken');

async function checkTestPage() {
  const pageId = '1123490870843189';
  const token = await getFacebookPageAccessToken(pageId);
  const res = await axios.get(`https://graph.facebook.com/v19.0/${pageId}`, {
    params: {
      access_token: token,
      fields: 'id,name,fan_count,followers_count,link,is_published'
    }
  });
  console.log('Test Page Info:', res.data);
  process.exit(0);
}

checkTestPage().catch(e => { console.error(e.response?.data || e.message); process.exit(1); });

