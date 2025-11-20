import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (storageError) {
      console.error('Errore nell\'accesso a localStorage:', storageError);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        let refreshToken;
        try {
          refreshToken = localStorage.getItem('refreshToken');
        } catch (storageError) {
          console.error('Errore nell\'accesso a localStorage:', storageError);
          window.location.href = '/login';
          return Promise.reject(new Error('Storage non disponibile'));
        }

        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken, refreshToken: newRefreshToken } = response.data.data;
        try {
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', newRefreshToken);
        } catch (storageError) {
          console.error('Errore nel salvataggio del token:', storageError);
          window.location.href = '/login';
          return Promise.reject(storageError);
        }

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        try {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        } catch (storageError) {
          console.error('Errore nella rimozione dei token:', storageError);
        }
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;

