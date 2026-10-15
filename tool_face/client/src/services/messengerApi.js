import axios from 'axios';
import { API_BASE_URL } from './apiBase';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 60000
});

export const messengerApi = {
  pages: async () => {
    const response = await api.get('/messenger/pages');
    return response.data;
  },
  // sync=true: server đồng bộ nhẹ với Facebook trước khi trả danh sách (có giới hạn tần suất)
  conversations: async ({ pageId = 'all', platform = 'all', filter = 'all', search = '', sync = false } = {}) => {
    const response = await api.get('/messenger/conversations', {
      params: { pageId, platform, filter, search: search || undefined, sync: sync ? 1 : undefined }
    });
    return response.data;
  },
  syncNow: async (pageId = 'all') => {
    const response = await api.post('/messenger/sync', { pageId });
    return response.data;
  },
  messages: async (conversationId, { sync = false, force = false } = {}) => {
    const response = await api.get(`/messenger/conversations/${encodeURIComponent(conversationId)}/messages`, {
      params: { sync: sync ? 1 : undefined, force: force ? 1 : undefined }
    });
    return response.data;
  },
  send: async (conversationId, { text, image }) => {
    const form = new FormData();
    if (text) form.append('text', text);
    if (image) form.append('image', image);
    const response = await api.post(`/messenger/conversations/${encodeURIComponent(conversationId)}/messages`, form);
    return response.data;
  },
  unread: async () => {
    const response = await api.get('/messenger/unread');
    return response.data;
  },

  // Trả lời tự động
  autoReplySettings: async () => {
    const response = await api.get('/messenger/auto-reply');
    return response.data;
  },
  saveAutoReply: async (payload) => {
    const response = await api.put('/messenger/auto-reply', payload);
    return response.data;
  },
  previewAutoReply: async (payload) => {
    const response = await api.post('/messenger/auto-reply/preview', payload);
    return response.data;
  }
};

export default messengerApi;
