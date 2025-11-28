import { create } from 'zustand';

const usePlayerStore = create((set, get) => ({
  currentTrack: null,
  queue: [],
  history: [],
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  shuffle: false,
  repeat: 'off', // 'off', 'one', 'all'
  likedTracks: new Set(),
  equalizerSettings: {
    enabled: false,
    preset: 'flat',
    bass: 0,
    mid: 0,
    treble: 0,
  },
  lyrics: null,
  showQueue: false,
  showEqualizer: false,
  showLyrics: false,

  setCurrentTrack: (track) => {
    const state = get();
    // Aggiungi alla history se diverso dal corrente
    if (state.currentTrack && state.currentTrack.id !== track?.id) {
      const newHistory = [state.currentTrack, ...state.history].slice(0, 50);
      set({ currentTrack: track, history: newHistory });
    } else {
      set({ currentTrack: track });
    }
  },
  
  setQueue: (tracks) => set({ queue: tracks }),
  
  addToQueue: (track) => set((state) => ({ queue: [...state.queue, track] })),
  
  removeFromQueue: (trackId) => set((state) => ({ 
    queue: state.queue.filter(t => t.id !== trackId) 
  })),
  
  reorderQueue: (startIndex, endIndex) => {
    const state = get();
    const newQueue = Array.from(state.queue);
    const [removed] = newQueue.splice(startIndex, 1);
    newQueue.splice(endIndex, 0, removed);
    set({ queue: newQueue });
  },
  
  play: () => set({ isPlaying: true }),
  
  pause: () => set({ isPlaying: false }),
  
  setCurrentTime: (time) => set({ currentTime: time }),
  
  setDuration: (duration) => set({ duration }),
  
  setVolume: (volume) => set({ volume }),
  
  toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),
  
  setRepeat: (mode) => {
    const modes = ['off', 'all', 'one'];
    const currentIndex = modes.indexOf(mode);
    const nextIndex = (currentIndex + 1) % modes.length;
    set({ repeat: modes[nextIndex] });
  },
  
  toggleLike: (trackId) => set((state) => {
    const newLiked = new Set(state.likedTracks);
    if (newLiked.has(trackId)) {
      newLiked.delete(trackId);
    } else {
      newLiked.add(trackId);
    }
    return { likedTracks: newLiked };
  }),
  
  setEqualizerSettings: (settings) => set((state) => ({
    equalizerSettings: { ...state.equalizerSettings, ...settings }
  })),
  
  setLyrics: (lyrics) => set({ lyrics }),
  
  toggleQueue: () => set((state) => ({ showQueue: !state.showQueue })),
  
  toggleEqualizer: () => set((state) => ({ showEqualizer: !state.showEqualizer })),
  
  toggleLyrics: () => set((state) => ({ showLyrics: !state.showLyrics })),
  
  next: () => {
    const { queue, currentTrack, shuffle, repeat, isPlaying } = get();
    if (queue.length === 0) return;
    
    const currentIndex = queue.findIndex(t => t.id === currentTrack?.id);
    
    // Se siamo all'ultimo brano
    if (currentIndex === queue.length - 1) {
      if (repeat === 'all') {
        // Riparti dall'inizio
        const nextIndex = shuffle ? Math.floor(Math.random() * queue.length) : 0;
        // Mantieni isPlaying a true per auto-play il prossimo brano
        set({ currentTrack: queue[nextIndex], isPlaying: isPlaying });
      } else {
        // Stop se repeat è 'off'
        set({ isPlaying: false, currentTrack: null });
      }
      return;
    }
    
    // Prossimo brano
    let nextIndex;
    if (shuffle) {
      // In shuffle, scegli un brano casuale diverso da quello corrente
      do {
        nextIndex = Math.floor(Math.random() * queue.length);
      } while (nextIndex === currentIndex && queue.length > 1);
    } else {
      nextIndex = currentIndex + 1;
    }
    
    // Mantieni isPlaying a true per auto-play il prossimo brano
    set({ currentTrack: queue[nextIndex], isPlaying: isPlaying });
  },
  
  previous: () => {
    const { queue, currentTrack } = get();
    if (queue.length === 0) return;
    
    const currentIndex = queue.findIndex(t => t.id === currentTrack?.id);
    const prevIndex = currentIndex <= 0 ? queue.length - 1 : currentIndex - 1;
    
    set({ currentTrack: queue[prevIndex] });
  },
}));

export default usePlayerStore;

