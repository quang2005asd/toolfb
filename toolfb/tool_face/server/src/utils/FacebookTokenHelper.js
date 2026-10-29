const axios = require('axios');
const { sql, getPool } = require('../../config/db');
const { encryptToken, decryptToken } = require('./FacebookPageConnections');

const graphVersion = process.env.FB_GRAPH_VERSION || 'v19.0';

/**
 * Tra cứu thông tin chi tiết của một token Facebook qua Debug Token API
 */
async function inspectToken(token) {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret || !token) {
    return null;
  }

  try {
    const response = await axios.get(`https://graph.facebook.com/${graphVersion}/debug_token`, {
      params: {
        input_token: token,
        access_token: `${appId}|${appSecret}`
      },
      timeout: 10000
    });

    const data = response.data?.data;
    if (!data) return null;

    const expiresAt = data.expires_at === 0 ? null : (data.expires_at ? new Date(data.expires_at * 1000) : null);
    const isPermanent = data.expires_at === 0;

    return {
      isValid: Boolean(data.is_valid),
      type: data.type, // 'USER' | 'PAGE'
      appId: data.app_id,
      userId: data.user_id,
      expiresAt,
      isPermanent,
      scopes: data.scopes || []
    };
  } catch (err) {
    console.warn('[FacebookTokenHelper inspectToken Warning]', err.response?.data?.error?.message || err.message);
    return null;
  }
}

/**
 * Nâng cấp một Short-lived Token (1-2 tiếng) thành Long-lived Token (60 ngày)
 * Dùng endpoint chính thống: grant_type=fb_exchange_token
 */
async function exchangeToLongLivedToken(shortLivedToken) {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!shortLivedToken || typeof shortLivedToken !== 'string') {
    return { token: shortLivedToken, isLongLived: false };
  }

  if (!appId || !appSecret) {
    console.warn('[FacebookTokenHelper] Thiếu FACEBOOK_APP_ID hoặc FACEBOOK_APP_SECRET trong .env, không thể exchange token.');
    return { token: shortLivedToken, isLongLived: false };
  }

  try {
    const response = await axios.get(`https://graph.facebook.com/${graphVersion}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLivedToken.trim()
      },
      timeout: 15000
    });

    if (response.data?.access_token) {
      console.log('💎 [Token Exchange] Đã nâng cấp thành công Token ngắn hạn sang Long-lived Token (60 ngày)!');
      return {
        token: response.data.access_token,
        expiresIn: response.data.expires_in || (60 * 24 * 60 * 60),
        isLongLived: true
      };
    }
  } catch (err) {
    const fbError = err.response?.data?.error?.message;
    console.warn('[FacebookTokenHelper Exchange Warning] Không thể nâng cấp sang Long-lived token (giữ token hiện tại):', fbError || err.message);
  }

  return { token: shortLivedToken, isLongLived: false };
}

/**
 * Tự động sửa/cấp lại Page Access Token vĩnh viễn cho một Fanpage
 * dựa trên tài khoản Facebook quản lý (ConnectedFbAccounts hoặc FacebookUsers)
 */
async function autoHealPageToken(pageId) {
  try {
    const pool = await getPool();
    // 1. Tìm thông tin Page và Nick Facebook quản lý
    const pageRes = await pool.request()
      .input('pageId', sql.VarChar(64), String(pageId))
      .query(`
        SELECT TOP 1 facebook_user_id, page_id, page_name, fb_account_id
        FROM dbo.FacebookPages
        WHERE page_id=@pageId
        ORDER BY updated_at DESC
      `);

    const page = pageRes.recordset[0];
    if (!page) return { success: false, message: 'Không tìm thấy Page trong database.' };

    let userAccessToken = null;

    // 2. Thử tìm token của Nick Facebook quản lý trong ConnectedFbAccounts
    if (page.fb_account_id) {
      const accRes = await pool.request()
        .input('fbUserId', sql.VarChar(64), String(page.fb_account_id))
        .query('SELECT TOP 1 access_token_encrypted FROM dbo.ConnectedFbAccounts WHERE fb_user_id=@fbUserId');
      if (accRes.recordset[0]?.access_token_encrypted) {
        userAccessToken = decryptToken(accRes.recordset[0].access_token_encrypted);
      }
    }

    // 3. Nếu không có, thử tìm trong FacebookUsers
    if (!userAccessToken && page.facebook_user_id) {
      const userRes = await pool.request()
        .input('userId', sql.VarChar(64), String(page.facebook_user_id))
        .query('SELECT TOP 1 user_access_token_encrypted FROM dbo.FacebookUsers WHERE facebook_user_id=@userId');
      if (userRes.recordset[0]?.user_access_token_encrypted) {
        userAccessToken = decryptToken(userRes.recordset[0].user_access_token_encrypted);
      }
    }

    if (!userAccessToken) {
      return { success: false, message: 'Không tìm thấy User Token của nick quản trị để cấp lại.' };
    }

    // 4. Thử nâng cấp User Token nếu cần
    const { token: longLivedUserToken } = await exchangeToLongLivedToken(userAccessToken);

    // 5. Lấy Page Token mới từ Facebook API
    let newPageToken = null;
    try {
      const pageInfo = await axios.get(`https://graph.facebook.com/${graphVersion}/${pageId}`, {
        params: { fields: 'access_token', access_token: longLivedUserToken },
        timeout: 10000
      });
      newPageToken = pageInfo.data?.access_token;
    } catch {}

    if (!newPageToken) {
      // Thử gọi /me/accounts
      try {
        const accountsRes = await axios.get(`https://graph.facebook.com/${graphVersion}/me/accounts`, {
          params: { fields: 'id,access_token', access_token: longLivedUserToken },
          timeout: 10000
        });
        const match = (accountsRes.data?.data || []).find((p) => String(p.id) === String(pageId));
        if (match?.access_token) {
          newPageToken = match.access_token;
        }
      } catch {}
    }

    if (!newPageToken) {
      return { success: false, message: 'Facebook API không trả về Page Token mới cho nick quản trị này.' };
    }

    // 6. Cập nhật Page Token vĩnh viễn mới vào DB
    const encrypted = encryptToken(newPageToken);
    await pool.request()
      .input('pageId', sql.VarChar(64), String(pageId))
      .input('token', sql.NVarChar(sql.MAX), encrypted)
      .query(`
        UPDATE dbo.FacebookPages
        SET page_access_token_encrypted=@token, is_valid=1, updated_at=SYSUTCDATETIME()
        WHERE page_id=@pageId
      `);

    // 7. Tự động hồi sinh các bài viết bị lỗi token (code 190) của ĐÚNG Fanpage này về APPROVED để poller nhặt lại
    try {
      await pool.request()
        .input('pId', sql.VarChar(64), String(pageId))
        .query(`
          UPDATE Posts 
          SET status = 'APPROVED',
              is_permanent_failure = 0,
              retry_count = 0,
              last_error = NULL,
              last_error_code = NULL,
              last_error_subcode = NULL,
              next_retry_at = NULL,
              alerted_at = NULL
          WHERE page_id = @pId
            AND (last_error_code = 190 OR (is_permanent_failure = 1 AND (last_error LIKE '%token%' OR last_error LIKE '%190%')))
            AND content_hash IS NOT NULL
            AND approved_hash IS NOT NULL
            AND content_hash = approved_hash;
        `);
    } catch (_) {}

    console.log(`🎉 [Auto-Renew Success] Đã tự động phục hồi Page Token Vĩnh Viễn cho Fanpage ${page.page_name} (${pageId})!`);
    return { success: true, token: newPageToken };
  } catch (err) {
    console.error(`[autoHealPageToken Error] Fanpage ${pageId}:`, err.message);
    return { success: false, message: err.message };
  }
}

module.exports = {
  autoHealPageToken,
  exchangeToLongLivedToken,
  inspectToken
};
