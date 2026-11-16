import axios from 'axios';
import { API_BASE } from './apiBase';

const api = axios.create({
  baseURL: `${API_BASE}/comment-ai`,
  withCredentials: true
});

// Mọi API của module này cần chỉ rõ Fanpage đang làm việc (pageId)
const q = (pageId, params = {}) => ({ params: { pageId, ...params } });

export const commentAiApi = {
  getSettings: async (pageId) => (await api.get('/settings', q(pageId))).data,
  saveSettings: async (pageId, body) => (await api.put('/settings', body, q(pageId))).data,
  subscribe: async (pageId) => (await api.post('/subscribe', {}, q(pageId))).data,
  preview: async (pageId, body) => (await api.post('/preview', body, q(pageId))).data,

  listTemplates: async (pageId) => (await api.get('/templates', q(pageId))).data,
  createTemplate: async (pageId, body) => (await api.post('/templates', body, q(pageId))).data,
  updateTemplate: async (pageId, id, body) => (await api.put(`/templates/${id}`, body, q(pageId))).data,
  approveTemplate: async (pageId, id) => (await api.post(`/templates/${id}/approve`, {}, q(pageId))).data,
  rejectTemplate: async (pageId, id, reason) => (await api.post(`/templates/${id}/reject`, { reason }, q(pageId))).data,
  deleteTemplate: async (pageId, id) => (await api.delete(`/templates/${id}`, q(pageId))).data,
  suggestTemplates: async (pageId) => (await api.post('/templates/suggest', {}, { ...q(pageId), timeout: 90000 })).data,

  listCustomers: async (pageId, params) => (await api.get('/customers', q(pageId, params))).data,
  getCustomer: async (pageId, id) => (await api.get(`/customers/${id}`, q(pageId))).data,
  updateCustomer: async (pageId, id, body) => (await api.put(`/customers/${id}`, body, q(pageId))).data,
  deleteCustomer: async (pageId, id) => (await api.delete(`/customers/${id}`, q(pageId))).data,

  listLeads: async (pageId, params) => (await api.get('/leads', q(pageId, params))).data,
  importLeads: async (pageId, file) => {
    const form = new FormData();
    form.append('file', file);
    // pageId phải nằm trên URL vì máy chủ cần biết Fanpage trước khi đọc file tải lên
    return (await api.post('/leads/import', form, { ...q(pageId), timeout: 120000 })).data;
  },
  updateLead: async (pageId, id, body) => (await api.put(`/leads/${id}`, body, q(pageId))).data,
  deleteLead: async (pageId, id) => (await api.delete(`/leads/${id}`, q(pageId))).data,
  draftLeadReply: async (pageId, id, templateId) => (await api.post(`/leads/${id}/reply`, { templateId }, { ...q(pageId), timeout: 60000 })).data,
  reclassifyLeads: async (pageId, scope = 'unknown') => (await api.post('/leads/reclassify', { scope }, q(pageId))).data,
  aiClassifyLeads: async (pageId) => (await api.post('/leads/ai-classify', {}, { ...q(pageId), timeout: 90000 })).data,
  getLeadRules: async (pageId) => (await api.get('/lead-rules', q(pageId))).data,
  saveLeadRules: async (pageId, body) => (await api.put('/lead-rules', body, q(pageId))).data,

  listLogs: async (pageId, params) => (await api.get('/logs', q(pageId, params))).data,
  deleteLog: async (pageId, id) => (await api.delete(`/logs/${id}`, q(pageId))).data,

  diagnostics: async (pageId, full) => (await api.get('/diagnostics', { ...q(pageId, full ? { full: 1 } : {}), timeout: 90000 })).data
};

export const apiMessage = (error, fallback) => error?.response?.data?.message || error?.message || fallback;

export default commentAiApi;
