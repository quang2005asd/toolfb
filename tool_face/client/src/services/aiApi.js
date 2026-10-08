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

  chat: async (message, history = [], conversationId = null, extra = {}) => {
    const response = await api.post('/ai/chat', {
      message,
      history,
      conversation_id: conversationId,
      ...extra
    });
    return response.data;
  },

  // ── AI Content Generator ──
  generatePosts: async ({ prompt, tone, includeHashtags, includeEmoji, enableWebSearch, eventDetails }) => {
    const response = await api.post('/ai/generate-posts', {
      prompt,
      tone,
      includeHashtags,
      includeEmoji,
      enableWebSearch,
      eventDetails
    });
    return response.data;
  },

  generateSeedingComments: async ({ postContent, count = 3, tone }) => {
    const response = await api.post('/ai/generate-seeding-comments', {
      postContent,
      count,
      tone
    });
    return response.data;
  },

  getDrafts: async (params = {}) => {
    const response = await api.get('/ai/drafts', { params });
    return response.data;
  },

  regenerateDraft: async (id) => {
    const response = await api.post(`/ai/drafts/${id}/regenerate`);
    return response.data;
  },

  updateDraft: async (id, updates) => {
    const response = await api.put(`/ai/drafts/${id}`, updates);
    return response.data;
  },

  deleteDraft: async (id) => {
    const response = await api.delete(`/ai/drafts/${id}`);
    return response.data;
  },

  publishDrafts: async (drafts) => {
    const response = await api.post('/ai/drafts/publish', { drafts });
    return response.data;
  },

  // ── AI Image Generator ──
  generateImage: async ({ prompt, title, topic, content, style = 'photorealistic', ratio = '1:1' }) => {
    const response = await api.post('/ai/generate-image', { prompt, title, topic, content, style, ratio });
    return response.data;
  },

  batchGenerateImages: async ({ drafts, style = 'photorealistic', ratio = '1:1' }) => {
    const response = await api.post('/ai/batch-generate-images', { drafts, style, ratio });
    return response.data;
  }
};

export default aiApi;

