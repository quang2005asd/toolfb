import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  withCredentials: true,
  timeout: 30000 // 30s timeout
});

let cachedStats = null;
let lastStatsFetchTime = 0;
const STATS_TTL_MS = 20 * 1000; // 20 seconds cache

export const postApi = {
  invalidateStatsCache: () => {
    cachedStats = null;
    lastStatsFetchTime = 0;
  },

  getStats: async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && cachedStats && (now - lastStatsFetchTime < STATS_TTL_MS)) {
      return cachedStats;
    }
    const response = await api.get('/posts/stats');
    cachedStats = response.data;
    lastStatsFetchTime = Date.now();
    return response.data;
  },

  getInsights: async (days = 14, pageId = '') => {
    const params = { days };
    if (pageId) params.pageId = pageId;
    const response = await api.get('/reports/insights', { params });
    return response.data;
  },

  getChannels: async () => {
    const response = await api.get('/channels');
    return response.data;
  },

  createPost: async (post) => {
    postApi.invalidateStatsCache();
    const response = await api.post('/posts', post);
    return response.data;
  },

  uploadMedia: async (formData) => {
    const response = await api.post('/media', formData);
    return response.data;
  },

  // 1. Lấy danh sách bài đăng có bộ lọc & phân trang
  getPostsList: async ({ page = 1, limit = 10, status = 'all', pageId = 'all' } = {}) => {
    const response = await api.get('/posts', {
      params: { page, limit, status, pageId }
    });
    return response.data;
  },

  // 2. Upload file Excel bài đăng
  bulkUpload: async (formData) => {
    postApi.invalidateStatsCache();
    const response = await api.post('/posts/bulk-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  // 2b. Xem trước dữ liệu file Excel
  bulkPreview: async (formData) => {
    const response = await api.post('/posts/bulk-preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  templateUrl: 'http://localhost:5000/api/posts/template',

  // 3. Kích hoạt đăng ngay cho 1 bài viết cụ thể
  triggerPostNow: async (postId) => {
    postApi.invalidateStatsCache();
    const response = await api.post(`/posts/${postId}/publish-now`);
    return response.data;
  },

  // 4. Xóa bài đăng khỏi hệ thống
  deletePost: async (postId) => {
    postApi.invalidateStatsCache();
    const response = await api.delete(`/posts/${postId}`);
    return response.data;
  },

  // 5. Hủy lịch bài đăng đang chờ
  cancelPost: async (postId) => {
    postApi.invalidateStatsCache();
    const response = await api.put(`/posts/${postId}/cancel`);
    return response.data;
  },

  // 6. Lấy chi tiết bài đăng (kèm comments)
  getPostDetail: async (postId) => {
    const response = await api.get(`/posts/${postId}`);
    return response.data;
  },

  // 7. Lấy thống kê tương tác thực tế từ Facebook Graph API
  getPostAnalytics: async (postId) => {
    const response = await api.get(`/posts/${postId}/analytics`);
    return response.data;
  },

  // 8. Đăng comment seeding ngay lập tức cho bài đã đăng
  postInstantComment: async (postId, content) => {
    const response = await api.post(`/posts/${postId}/comments/instant`, { content });
    return response.data;
  }
};

export default postApi;