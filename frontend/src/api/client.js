import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 300000,
});

// Request interceptor — inject auth token if present
client.interceptors.request.use(config => {
  const token = sessionStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor — handle 401 (unauthorized) / token expirado
client.interceptors.response.use(
  res => res,
  async err => {
    const originalRequest = err.config;
    if (err.response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes('/auth/refresh/')) {
      originalRequest._retry = true;
      const refreshToken = sessionStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const res = await axios.post(`${API_BASE}/auth/refresh/`, { refresh_token: refreshToken });
          sessionStorage.setItem('auth_token', res.data.token);
          originalRequest.headers.Authorization = `Bearer ${res.data.token}`;
          return client(originalRequest);
        } catch (refreshErr) {
          sessionStorage.removeItem('auth_user');
          sessionStorage.removeItem('auth_token');
          sessionStorage.removeItem('refresh_token');
          window.location.href = '/login';
          return Promise.reject(refreshErr);
        }
      } else {
        sessionStorage.removeItem('auth_user');
        sessionStorage.removeItem('auth_token');
        if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/reset-password')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  }
);

export default client;

const asUniversityPayload = (data = {}) => {
  if (!data.logo_file) return data;

  const formData = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    if (key === 'logo_file') {
      formData.append('logo', value);
    } else if (value !== undefined && value !== null) {
      formData.append(key, value);
    }
  });
  return formData;
};

const universityRequestConfig = (payload) =>
  payload instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined;

// ─── API helpers ────────────────────────────────────────────────
export const api = {
  auth: {
    login:    (data) => client.post('/auth/login/', data),
    register: (data) => client.post('/auth/register/', data),
    verify2fa: (data) => client.post('/auth/2fa/verify/', data),
    status:   () => client.get('/auth/status/'),
  },
  users: {
    list:   ()         => client.get('/users/'),
    create: (data)     => client.post('/users/', data),
    update: (id, data) => client.put(`/users/${id}/`, data),
    remove: (id)       => client.delete(`/users/${id}/`),
  },
  universities: {
    list:   ()         => client.get('/universities/'),
    create: (data)     => {
      const payload = asUniversityPayload(data);
      return client.post('/universities/', payload, universityRequestConfig(payload));
    },
    update: (id, data) => {
      const payload = asUniversityPayload(data);
      return client.put(`/universities/${id}/`, payload, universityRequestConfig(payload));
    },
    remove: (id)       => client.delete(`/universities/${id}/`),
  },
  indicators: {
    list:   ()         => client.get('/indicators/'),
    create: (data)     => client.post('/indicators/', data),
    update: (id, data) => client.put(`/indicators/${id}/`, data),
    remove: (id)       => client.delete(`/indicators/${id}/`),
    uploadTemplate: (id, formData) => client.post(`/indicators/${id}/template/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
    deleteTemplate: (id) => client.delete(`/indicators/${id}/template/`),
  },
  evidences: {
    list:     (params)              => client.get('/evidences/', { params }),
    get:      (id)                  => client.get(`/evidences/${id}/`),
    update:   (id, data)            => client.put(`/evidences/${id}/`, data),
    bulkUpdate: (data)              => client.put('/evidences/bulk/', data),
    bulkDelete: (data)              => client.delete('/evidences/bulk_delete/', { data }),
    remove:   (id)                  => client.delete(`/evidences/${id}/`),
    download: (id)                  => client.get(`/evidences/${id}/download/`),
    /** Upload con archivo — multipart/form-data con callback de progreso (0-100) */
    upload: (formData, onProgress) =>
      client.post('/evidences/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: e =>
          onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
      }),
  },
  scraper: {
    espoch: (data) => client.post('/scraper/espoch/', data),
  },
  stats:  ()    => client.get('/stats/'),
  roles:  ()    => client.get('/roles/'),
  passwordReset: {
    request: (email)       => client.post('/auth/password-reset/request/', { email }),
    confirm: (token, data) => client.post(`/auth/password-reset/confirm/${token}/`, data),
  },
};
