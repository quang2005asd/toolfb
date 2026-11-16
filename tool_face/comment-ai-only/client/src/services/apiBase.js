export const API_ORIGIN = (process.env.NEXT_PUBLIC_API_ORIGIN
  ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : '')).replace(/\/$/, '');

export const API_BASE = `${API_ORIGIN}/api`;
