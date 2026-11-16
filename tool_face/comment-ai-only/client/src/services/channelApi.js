import axios from 'axios';
import { API_BASE } from './apiBase';

const api = axios.create({ baseURL: `${API_BASE}/channels`, withCredentials: true });

const channelApi = {
  list: async () => (await api.get('/')).data,
  connectFacebookToken: async (token) => (await api.post('/connect-facebook', { token })).data,
  addManual: async (pageId, pageToken) => (await api.post('/manual', { pageId, pageToken })).data,
  disconnect: async (pageId) => (await api.delete(`/${encodeURIComponent(pageId)}`)).data,
  syncAll: async () => (await api.post('/sync')).data,
  facebookLoginUrl: `${API_BASE}/auth/facebook`
};

export default channelApi;
