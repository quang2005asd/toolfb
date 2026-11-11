import axios from 'axios';
import { API_BASE } from './apiBase';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true
});

export const settingsApi = {
  get: async () => {
    const response = await api.get('/settings');
    return response.data;
  },
  update: async (settings) => {
    const response = await api.post('/settings', settings);
    return response.data;
  },
  testAi: async (params) => {
    const response = await api.post('/settings/test-ai', params);
    return response.data;
  },
  testTelegram: async (params) => {
    const response = await api.post('/settings/telegram/test', params);
    return response.data;
  },
  // Meta App chung của tool (Admin): mọi người dùng đăng nhập Facebook qua app này
  getMetaApp: async () => {
    const response = await api.get('/settings/meta-app');
    return response.data;
  },
  saveMetaApp: async (payload) => {
    const response = await api.put('/settings/meta-app', payload);
    return response.data;
  },
  removeMetaApp: async () => {
    const response = await api.delete('/settings/meta-app');
    return response.data;
  },
  runTokenHealthCheck: async () => {
    const response = await api.post('/channels/health-check');
    return response.data;
  }
};

export default settingsApi;
