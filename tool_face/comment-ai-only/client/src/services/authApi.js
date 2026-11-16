import axios from 'axios';
import { API_BASE } from './apiBase';

const api = axios.create({ baseURL: `${API_BASE}/auth`, withCredentials: true });

const authApi = {
  me: async () => (await api.get('/me')).data,
  login: async (identifier, password) => (await api.post('/login', { identifier, password })).data,
  logout: async () => (await api.post('/logout')).data
};

export default authApi;
