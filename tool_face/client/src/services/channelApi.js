import axios from 'axios';
import { API_BASE } from './apiBase';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true
});

let cachedChannels = null;
let lastChannelsFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000; // Cache 60 seconds

export const channelApi = {
  list: async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && cachedChannels && (now - lastChannelsFetchTime < CACHE_TTL_MS)) {
      return cachedChannels;
    }
    const response = await api.get('/channels');
    cachedChannels = response.data;
    lastChannelsFetchTime = Date.now();
    return response.data;
  },

  invalidateCache: () => {
    cachedChannels = null;
    lastChannelsFetchTime = 0;
  },

  connectFacebookToken: async (token) => {
    channelApi.invalidateCache();
    const response = await api.post('/channels/connect-facebook', { token });
    return response.data;
  },

  addManual: async (pageId, pageToken) => {
    channelApi.invalidateCache();
    const response = await api.post('/channels/manual', { pageId, pageToken });
    return response.data;
  },

  disconnect: async (pageId) => {
    channelApi.invalidateCache();
    const response = await api.delete(`/channels/${pageId}`);
    return response.data;
  },

  // mode 'force': đồng bộ lại ngay với Facebook; 'auto': server chỉ gọi Facebook tối đa 2 phút/lần
  syncAll: async (mode = 'force') => {
    channelApi.invalidateCache();
    const response = await api.post('/channels/sync', { mode });
    return response.data;
  },

  getAccounts: async () => {
    const response = await api.get('/channels/accounts');
    return response.data;
  },

  disconnectAccount: async (fbAccountId) => {
    channelApi.invalidateCache();
    const response = await api.delete(`/channels/accounts/${fbAccountId}`);
    return response.data;
  },

  checkTokens: async () => {
    channelApi.invalidateCache();
    const response = await api.get('/channels/check-tokens');
    return response.data;
  },

  // Trạng thái token từng nick Facebook & làm mới ngay
  tokenStatus: async () => {
    const response = await api.get('/channels/token-status');
    return response.data;
  },
  renewTokens: async () => {
    channelApi.invalidateCache();
    const response = await api.post('/channels/token-renew');
    return response.data;
  },
  facebookLoginUrl: `${API_BASE}/auth/facebook`,

  // Meta App riêng của người dùng (mục Nâng cao — mặc định đăng nhập bằng app chung của tool)
  myMetaApps: async () => {
    const response = await api.get('/channels/my-meta-app');
    return response.data;
  },
  saveMyMetaApp: async (appId, appSecret, label) => {
    const response = await api.post('/channels/my-meta-app', { appId, appSecret, label });
    return response.data;
  },
  removeMyMetaApp: async (appId) => {
    const response = await api.delete(`/channels/my-meta-app/${encodeURIComponent(appId)}`);
    return response.data;
  },
  // Đường dẫn đăng nhập Facebook (cửa sổ phụ): appId bỏ trống = app chung; level: 'full' | 'minimal'
  facebookLoginUrlFor: (appId, level = 'full') => {
    const params = new URLSearchParams({ popup: '1', level });
    if (appId) params.set('app', appId);
    return `${API_BASE}/auth/facebook?${params.toString()}`;
  },

  // Hộp "Chọn Fanpage": danh sách Fanpage của một nick (đọc từ Facebook) và lưu lựa chọn
  accountPages: async (fbAccountId) => {
    const response = await api.get(`/channels/accounts/${encodeURIComponent(fbAccountId)}/pages`);
    return response.data;
  },
  saveAccountPages: async (fbAccountId, pageIds) => {
    channelApi.invalidateCache();
    const response = await api.put(`/channels/accounts/${encodeURIComponent(fbAccountId)}/pages`, { pageIds });
    return response.data;
  },

  // Mức độ sẵn sàng đăng nhập Facebook (setup / login / expired / partial / ready) + quyền từng tính năng
  facebookStatus: async (refresh = false) => {
    const response = await api.get('/channels/facebook-status', { params: refresh ? { refresh: 1 } : {} });
    return response.data;
  },

  // Instagram Business / Creator liên kết với Fanpage
  instagramAccounts: async () => {
    const response = await api.get('/channels/instagram');
    return response.data;
  },
  syncInstagram: async () => {
    const response = await api.post('/channels/instagram/sync');
    return response.data;
  },
  // Kiểm tra từng bước đọc tin nhắn Instagram của một Fanpage
  diagnoseInstagram: async (pageId) => {
    const response = await api.get(`/channels/instagram/${encodeURIComponent(pageId)}/diagnose`);
    return response.data;
  },

  // TikTok Accounts (Cookie / Puppeteer)
  tiktokAccounts: async () => {
    const response = await api.get('/channels/tiktok');
    return response.data;
  },
  addTikTokAccount: async (cookies, nickname) => {
    const response = await api.post('/channels/tiktok', { cookies, nickname });
    return response.data;
  },
  checkTikTokAccount: async (id) => {
    const response = await api.post(`/channels/tiktok/${id}/check`);
    return response.data;
  },
  deleteTikTokAccount: async (id) => {
    const response = await api.delete(`/channels/tiktok/${id}`);
    return response.data;
  }
};

export default channelApi;
