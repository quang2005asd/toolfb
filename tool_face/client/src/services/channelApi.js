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

  syncAll: async () => {
    channelApi.invalidateCache();
    const response = await api.post('/channels/sync');
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
