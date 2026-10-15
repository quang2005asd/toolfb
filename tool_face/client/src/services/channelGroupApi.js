import axios from 'axios';
import { API_BASE_URL } from './apiBase';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true
});

export const channelGroupApi = {
  list: async () => {
    const response = await api.get('/channel-groups');
    return response.data;
  },
  create: async ({ name, color, pageIds }) => {
    const response = await api.post('/channel-groups', { name, color, pageIds });
    return response.data;
  },
  update: async (id, { name, color, pageIds }) => {
    const response = await api.put(`/channel-groups/${id}`, { name, color, pageIds });
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/channel-groups/${id}`);
    return response.data;
  }
};

export default channelGroupApi;
