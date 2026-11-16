const axios = require('axios');
const { getStoredPageAccessToken, encryptToken } = require('./FacebookPageConnections');
const { sql, getPool } = require('../../config/db');

const graphVersion = process.env.FB_GRAPH_VERSION || 'v19.0';

async function getFacebookPageAccessToken(pageId) {
  let storedPageToken = await getStoredPageAccessToken(pageId);
  if (storedPageToken) {
    // Nếu token lưu trong DB là User Token, Facebook sẽ từ chối unpublished post với lỗi #200.
    // Ta tự động lấy Page Access Token từ Facebook và cập nhật vào DB
    try {
      const pageInfo = await axios.get(`https://graph.facebook.com/${graphVersion}/${pageId}`, {
        params: { fields: 'access_token', access_token: storedPageToken },
        timeout: 10000
      });
      if (pageInfo.data?.access_token && pageInfo.data.access_token !== storedPageToken) {
        console.log(`[Token Converter] Đã tự động nâng cấp User Token thành Page Token cho Fanpage ${pageId}`);
        const pool = await getPool();
        const encrypted = encryptToken(pageInfo.data.access_token);
        await pool.request()
          .input('pageId', sql.VarChar(64), String(pageId))
          .input('token', sql.NVarChar(sql.MAX), encrypted)
          .query('UPDATE dbo.FacebookPages SET page_access_token_encrypted=@token WHERE page_id=@pageId');
        return pageInfo.data.access_token;
      }
    } catch {}
    return storedPageToken;
  }

  const configuredToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!configuredToken) {
    throw new Error('Thiếu FACEBOOK_PAGE_ACCESS_TOKEN trong server/.env');
  }

  const identityResponse = await axios.get(
    `https://graph.facebook.com/${graphVersion}/me`,
    { params: { fields: 'id', access_token: configuredToken } }
  );

  if (identityResponse.data.id === String(pageId)) {
    return configuredToken;
  }

  const accountsResponse = await axios.get(
    `https://graph.facebook.com/${graphVersion}/me/accounts`,
    {
      params: {
        fields: 'id,access_token',
        access_token: configuredToken
      }
    }
  );
  const page = (accountsResponse.data.data || []).find(
    (account) => account.id === String(pageId)
  );

  if (!page?.access_token) {
    throw new Error(`Không lấy được Page Access Token cho Fanpage ${pageId}.`);
  }

  return page.access_token;
}

module.exports = { getFacebookPageAccessToken };