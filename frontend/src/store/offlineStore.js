import { create } from 'zustand';

const STORAGE_KEY = 'alefy_offline_mode';

function getStoredValue() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
}

const useOfflineStore = create((set) => ({
  isOfflineMode: getStoredValue(),

  setOfflineMode: (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch (e) {
      console.error('Errore salvataggio offline mode:', e);
    }
    set({ isOfflineMode: Boolean(value) });
  },

  toggleOfflineMode: () => {
    set((state) => {
      const next = !state.isOfflineMode;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch (e) {
        console.error('Errore salvataggio offline mode:', e);
      }
      return { isOfflineMode: next };
    });
  },

  syncFromStorage: () => {
    set({ isOfflineMode: getStoredValue() });
  },
}));

export default useOfflineStore;
