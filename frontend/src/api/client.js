import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// Request interceptor — inject auth token if present
client.interceptors.request.use(config => {
  const token = sessionStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor — handle 401
client.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem('auth_user');
      sessionStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default client;

// ─── API helpers ────────────────────────────────────────────────
export const api = {
  auth: {
    login:    (data) => client.post('/auth/login/', data),
    register: (data) => client.post('/auth/register/', data),
  },
  users:        {
    list:   ()       => client.get('/users/'),
    create: (data)   => client.post('/users/', data),
    update: (id, data) => client.put(`/users/${id}/`, data),
    remove: (id)     => client.delete(`/users/${id}/`),
  },
  universities: {
    list:   ()       => client.get('/universities/'),
    create: (data)   => client.post('/universities/', data),
    update: (id, data) => client.put(`/universities/${id}/`, data),
    remove: (id)     => client.delete(`/universities/${id}/`),
  },
  indicators:   {
    list:   ()       => client.get('/indicators/'),
    create: (data)   => client.post('/indicators/', data),
    update: (id, data) => client.put(`/indicators/${id}/`, data),
    remove: (id)     => client.delete(`/indicators/${id}/`),
  },
  stats:        ()   => client.get('/stats/'),
  roles:        ()   => client.get('/roles/'),
  passwordReset: {
    request: (email)          => client.post('/auth/password-reset/request/', { email }),
    confirm: (token, data)    => client.post(`/auth/password-reset/confirm/${token}/`, data),
  },
};
