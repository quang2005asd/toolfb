import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  withCredentials: true
});

export const userApi = {
  // Phân quyền & quản lý tài khoản cấp dưới
  roles: async () => {
    const response = await api.get('/roles');
    return response.data;
  },
  list: async () => {
    const response = await api.get('/users');
    return response.data;
  },
  create: async (payload) => {
    const response = await api.post('/users', payload);
    return response.data;
  },
  update: async (id, payload) => {
    const response = await api.patch(`/users/${id}`, payload);
    return response.data;
  },
  resetPassword: async (id, payload) => {
    const response = await api.post(`/users/${id}/reset-password`, payload);
    return response.data;
  },
  remove: async (id) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
  },

  // Hồ sơ cá nhân
  updateProfile: async (payload) => {
    const response = await api.patch('/profile', payload);
    return response.data;
  },
  changePassword: async (payload) => {
    const response = await api.post('/profile/password', payload);
    return response.data;
  }
};

export default userApi;
