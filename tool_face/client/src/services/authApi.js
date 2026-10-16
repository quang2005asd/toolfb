import axios from 'axios';
import { API_BASE } from './apiBase';

const API_BASE_URL = API_BASE;

export const SERVER_DOWN_MESSAGE = 'Không kết nối được máy chủ API. Máy chủ đang tắt hoặc đang khởi động lại — thử lại sau ít phút (quản trị viên: chạy "docker compose up -d" trong thư mục tool_face).';

// Máy chủ tắt: gọi thẳng thì axios báo "Network Error"; đi qua nginx / Caddy thì nhận 502–504
export function isServerDown(err) {
  return Boolean(err) && (!err.response || [502, 503, 504].includes(err.response.status));
}

export function describeAuthError(err, fallback) {
  if (isServerDown(err)) return SERVER_DOWN_MESSAGE;
  if (err?.response?.data?.message) return err.response.data.message;
  return err?.message || fallback;
}

export const authApi = {
  health: async () => {
    const response = await axios.get(`${API_BASE_URL}/health`, { timeout: 4000 });
    return response.data;
  },
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
