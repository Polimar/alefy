import { useEffect, useRef, useState } from 'react';
import usePlayerStore from '../store/playerStore';
import api from '../utils/api';
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import './Player.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function Player() {
  const audioRef = useRef(null);
  const blobUrlRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    shuffle,
    repeat,
    play,
    pause,
    setCurrentTime,
    setDuration,
    setVolume,
    next,
    previous,
    toggleShuffle,
    setRepeat,
  } = usePlayerStore();

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      if (audio.currentTime !== undefined && !isNaN(audio.currentTime)) {
        setCurrentTime(audio.currentTime);
      }
    };
    
    const updateDuration = () => {
      if (audio.duration !== undefined && !isNaN(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    
    const handleCanPlay = () => {
      // Quando l'audio è pronto, aggiorna la durata
      updateDuration();
    };
    
    const handleEnded = () => {
      if (repeat === 'one') {
        audio.currentTime = 0;
        audio.play();
      } else {
        next();
      }
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('durationchange', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [setCurrentTime, setDuration, next, repeat]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      // Aspetta che l'audio sia pronto prima di fare play
      if (audio.readyState >= 2) { // HAVE_CURRENT_DATA o superiore
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            // Ignora AbortError - significa che è stato interrotto da un nuovo load
            if (err.name !== 'AbortError') {
              console.error('Error playing audio:', err);
              setError('Errore nella riproduzione');
              pause();
            }
          });
        }
      } else {
        // Se l'audio non è pronto, aspetta che lo sia
        const handleCanPlay = () => {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(err => {
              if (err.name !== 'AbortError') {
                console.error('Error playing audio:', err);
                setError('Errore nella riproduzione');
                pause();
              }
            });
          }
          audio.removeEventListener('canplay', handleCanPlay);
        };
        audio.addEventListener('canplay', handleCanPlay);
        return () => {
          audio.removeEventListener('canplay', handleCanPlay);
        };
      }
    } else {
      audio.pause();
    }
  }, [isPlaying, pause]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    // Cleanup previous blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    const loadAudio = async () => {
      try {
        setLoading(true);
        setError(null);
        pause(); // Pausa prima di caricare nuovo brano

        const token = localStorage.getItem('accessToken');
        const streamUrl = `${API_URL}/stream/tracks/${currentTrack.id}`;

        // Usa direttamente l'URL dello stream invece del blob per supportare Range Requests e seek
        audio.src = streamUrl;
        audio.crossOrigin = 'anonymous';
        
        // Imposta header Authorization tramite fetch e poi usa blob, oppure usa direttamente l'URL
        // Per supportare seek, usiamo direttamente l'URL con token nell'header
        // Ma l'audio element non supporta header custom, quindi usiamo un approccio diverso:
        // Creiamo un blob ma solo dopo aver verificato che funziona
        
        // Verifica autenticazione prima
        const testResponse = await fetch(streamUrl, {
          method: 'HEAD',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!testResponse.ok) {
          if (testResponse.status === 401) {
            // Try to refresh token
            const refreshToken = localStorage.getItem('refreshToken');
            if (refreshToken) {
              try {
                const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ refreshToken }),
                });

                if (refreshResponse.ok) {
                  const refreshData = await refreshResponse.json();
                  const { accessToken, refreshToken: newRefreshToken } = refreshData.data || refreshData;
                  localStorage.setItem('accessToken', accessToken);
                  localStorage.setItem('refreshToken', newRefreshToken);

                  // Usa il nuovo token per lo stream
                  const newStreamUrl = `${API_URL}/stream/tracks/${currentTrack.id}?token=${accessToken}`;
                  // In alternativa, carica il blob con il nuovo token
                  const retryResponse = await fetch(streamUrl, {
                    headers: {
                      'Authorization': `Bearer ${accessToken}`,
                    },
                  });

                  if (!retryResponse.ok) {
                    throw new Error('Errore di autenticazione');
                  }

                  const blob = await retryResponse.blob();
                  blobUrlRef.current = URL.createObjectURL(blob);
                  audio.src = blobUrlRef.current;
                  audio.load();
                  // NON chiamare play() automaticamente - aspetta che l'utente clicchi
                  return;
                }
              } catch (refreshError) {
                console.error('Token refresh failed:', refreshError);
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                window.location.href = '/login';
                return;
              }
            }
          }
          throw new Error(`Errore ${testResponse.status}: ${testResponse.statusText}`);
        }

        // Carica il blob per supportare seek
        const response = await fetch(streamUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Errore ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();
        blobUrlRef.current = URL.createObjectURL(blob);
        audio.src = blobUrlRef.current;
        audio.load();
        // NON chiamare play() automaticamente - aspetta che l'utente clicchi
      } catch (err) {
        console.error('Error loading audio:', err);
        setError(err.message || 'Errore nel caricamento del brano');
        pause();
      } finally {
        setLoading(false);
      }
    };

    loadAudio();

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [currentTrack, pause]);

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (!audio || !duration || duration === 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = Math.max(0, Math.min(duration, percent * duration));
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!currentTrack) return null;

  return (
    <div className="player">
      <audio ref={audioRef} />
      {error && (
        <div className="player-error" style={{ 
          position: 'absolute', 
          top: '-30px', 
          left: '50%', 
          transform: 'translateX(-50%)',
          background: 'var(--error, #ff4444)',
          color: 'white',
          padding: '4px 12px',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          {error}
        </div>
      )}
      {loading && (
        <div className="player-loading" style={{ 
          position: 'absolute', 
          top: '-30px', 
          left: '50%', 
          transform: 'translateX(-50%)',
          color: 'var(--text-secondary)',
          fontSize: '12px'
        }}>
          Caricamento...
        </div>
      )}
      <div className="player-content">
        <div className="player-track-info">
          <div className="track-title">{currentTrack.title}</div>
          <div className="track-artist">{currentTrack.artist}</div>
        </div>
        <div className="player-controls">
          <div className="control-buttons">
            <button onClick={previous} className="control-btn">
              <SkipBack size={20} />
            </button>
            <button
              onClick={isPlaying ? pause : play}
              className="control-btn play-btn"
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>
            <button onClick={next} className="control-btn">
              <SkipForward size={20} />
            </button>
          </div>
          <div className="progress-container" onClick={handleSeek}>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
            </div>
            <div className="time-display">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>
        <div className="player-volume">
          <Volume2 size={18} />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="volume-slider"
          />
        </div>
      </div>
    </div>
  );
}

