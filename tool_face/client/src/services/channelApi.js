import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
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
  }
};

export default channelApi;
