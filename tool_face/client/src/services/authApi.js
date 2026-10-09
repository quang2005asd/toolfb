import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

export const authApi = {
  status: async () => {
    const response = await axios.get(`${API_BASE_URL}/auth/status`, { withCredentials: true });
    return response.data;
  },
  me: async () => {
    const response = await axios.get(`${API_BASE_URL}/auth/me`, { withCredentials: true });
    return response.data;
  },
  logout: async () => {
    const response = await axios.post(`${API_BASE_URL}/auth/logout`, {}, { withCredentials: true });
    return response.data;
  },
  // identifier: tên đăng nhập hoặc Gmail
  login: async ({ identifier, password }) => {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, { identifier, password }, { withCredentials: true });
    return response.data;
  },
  register: async ({ username, email, password, confirmPassword }) => {
    const response = await axios.post(`${API_BASE_URL}/auth/register`, { username, email, password, confirmPassword }, { withCredentials: true });
    return response.data;
  },
  checkAccount: async (identifier) => {
    const response = await axios.get(`${API_BASE_URL}/auth/check-account`, { params: { identifier }, withCredentials: true });
    return response.data;
  },
  facebookLoginUrl: `${API_BASE_URL}/auth/facebook`
};

export default authApi;
