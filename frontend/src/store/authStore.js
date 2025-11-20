import { create } from 'zustand';
import api from '../utils/api';

const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  loading: true,

  login: async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, accessToken, refreshToken } = response.data.data;
      
      try {
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
      } catch (storageError) {
        console.error('Errore nel salvataggio del token:', storageError);
        return {
          success: false,
          error: 'Errore nel salvataggio della sessione. Verifica che il browser permetta l\'uso di localStorage.',
        };
      }
      
      set({ user, isAuthenticated: true });
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message || 'Errore durante il login';
      console.error('Login error:', error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  },

  register: async (email, password, username) => {
    try {
      const response = await api.post('/auth/register', { email, password, username });
      const { user, accessToken, refreshToken } = response.data.data;
      
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      
      set({ user, isAuthenticated: true });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Errore durante la registrazione',
      };
    }
  },

  logout: async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      set({ user: null, isAuthenticated: false });
    }
  },

  checkAuth: async () => {
    try {
      let token;
      try {
        token = localStorage.getItem('accessToken');
      } catch (storageError) {
        console.error('Errore nell\'accesso a localStorage:', storageError);
        set({ isAuthenticated: false, loading: false });
        return;
      }

      if (!token) {
        set({ isAuthenticated: false, loading: false });
        return;
      }

      const response = await api.get('/auth/me');
      set({ user: response.data.data.user, isAuthenticated: true, loading: false });
      return response.data.data.user;
    } catch (error) {
      console.error('CheckAuth error:', error);
      try {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } catch (storageError) {
        console.error('Errore nella rimozione dei token:', storageError);
      }
      set({ user: null, isAuthenticated: false, loading: false });
    }
  },
}));

export default useAuthStore;

