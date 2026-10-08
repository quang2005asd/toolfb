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
  login: async ({ username, password }) => {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, { username, password }, { withCredentials: true });
    return response.data;
  },
  register: async ({ username, password, displayName }) => {
    const response = await axios.post(`${API_BASE_URL}/auth/register`, { username, password, displayName }, { withCredentials: true });
    return response.data;
  },
  loginWithToken: async (token) => {
    const response = await axios.post(`${API_BASE_URL}/auth/token`, { token }, { withCredentials: true });
    return response.data;
  },
  facebookLoginUrl: `${API_BASE_URL}/auth/facebook`
};

export default authApi;
