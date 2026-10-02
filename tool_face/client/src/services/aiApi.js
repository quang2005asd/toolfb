import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  withCredentials: true
});

export const aiApi = {
  status: async () => {
    const response = await api.get('/ai/status');
    return response.data;
  },

  getConversations: async () => {
    const response = await api.get('/ai/conversations');
    return response.data;
  },

  getConversation: async (id) => {
    const response = await api.get(`/ai/conversations/${id}`);
    return response.data;
  },

  createConversation: async (title = 'Cuộc trò chuyện mới') => {
    const response = await api.post('/ai/conversations', { title });
    return response.data;
  },

  renameConversation: async (id, title) => {
    const response = await api.patch(`/ai/conversations/${id}`, { title });
    return response.data;
  },

  deleteConversation: async (id) => {
    const response = await api.delete(`/ai/conversations/${id}`);
    return response.data;
  },

  chat: async (message, history = [], conversationId = null) => {
    const response = await api.post('/ai/chat', {
      message,
      history,
      conversation_id: conversationId
    });
    return response.data;
  }
};

export default aiApi;
