import { create } from 'zustand';

const usePlayerStore = create((set, get) => ({
  currentTrack: null,
  queue: [],
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  shuffle: false,
  repeat: 'off', // 'off', 'one', 'all'

  setCurrentTrack: (track) => set({ currentTrack: track }),
  
  setQueue: (tracks) => set({ queue: tracks }),
  
  addToQueue: (track) => set((state) => ({ queue: [...state.queue, track] })),
  
  play: () => set({ isPlaying: true }),
  
  pause: () => set({ isPlaying: false }),
  
  setCurrentTime: (time) => set({ currentTime: time }),
  
  setDuration: (duration) => set({ duration }),
  
  setVolume: (volume) => set({ volume }),
  
  toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),
  
  setRepeat: (mode) => set({ repeat: mode }),
  
  next: () => {
    const { queue, currentTrack, shuffle, repeat } = get();
    if (queue.length === 0) return;
    
    const currentIndex = queue.findIndex(t => t.id === currentTrack?.id);
    let nextIndex;
    
    if (shuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else {
      nextIndex = (currentIndex + 1) % queue.length;
    }
    
    if (nextIndex === 0 && repeat !== 'all') {
      set({ isPlaying: false, currentTrack: null });
    } else {
      set({ currentTrack: queue[nextIndex] });
    }
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

