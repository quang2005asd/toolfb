import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
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
  }
};

export default settingsApi;
