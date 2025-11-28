import { useEffect, useRef, useState } from 'react';
import usePlayerStore from '../store/playerStore';
import api from '../utils/api';
import { getTrackOffline } from '../utils/offlineStorage';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Shuffle, Repeat, Repeat1, Heart, ListMusic, Music, Sliders } from 'lucide-react';
import AudioWaveform from './AudioWaveform';
import QueuePanel from './QueuePanel';
import EqualizerPanel from './EqualizerPanel';
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
    likedTracks,
    showQueue,
    showEqualizer,
    play,
    pause,
    setCurrentTime,
    setDuration,
    setVolume,
    next,
    previous,
    toggleShuffle,
    setRepeat,
    toggleLike,
    toggleQueue,
    toggleEqualizer,
  } = usePlayerStore();
  
  const [coverUrl, setCoverUrl] = useState(null);

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
      // Se isPlaying è true e l'audio è pronto, riproduci automaticamente
      if (isPlaying && audio.readyState >= 2) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            if (err.name !== 'AbortError') {
              console.error('Error auto-playing on canplay:', err);
            }
          });
        }
      }
    };
    
    const handleEnded = () => {
      if (repeat === 'one') {
        audio.currentTime = 0;
        audio.play();
      } else {
        next();
        // Auto-play il prossimo brano dopo next()
        // Il useEffect per isPlaying gestirà il play quando l'audio è pronto
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
  }, [setCurrentTime, setDuration, next, repeat, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

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
  }, [isPlaying, pause, currentTrack]);

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
        // NON chiamare pause() qui - lascia che il controllo isPlaying gestisca la pausa
        // Se isPlaying è true, l'audio verrà riprodotto automaticamente quando è pronto

        // Controlla prima se la traccia è disponibile offline
        const offlineTrack = await getTrackOffline(currentTrack.id);
        
        if (offlineTrack) {
          console.log(`[Player] Traccia ${currentTrack.id} trovata offline, uso versione locale`);
          blobUrlRef.current = URL.createObjectURL(offlineTrack.audioBlob);
          audio.src = blobUrlRef.current;
          audio.load();
          return;
        }

        // Se non è offline, carica normalmente dal server
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
        
        // L'auto-play sarà gestito dal useEffect che monitora isPlaying
        // Non serve aggiungere listener qui perché il useEffect per isPlaying lo gestirà
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
  }, [currentTrack, pause, isPlaying]);

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (!audio || !duration || duration === 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = Math.max(0, Math.min(duration, percent * duration));
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Carica cover art quando cambia la traccia
  useEffect(() => {
    let currentBlobUrl = null;

    const loadCoverArt = async () => {
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
      }

      if (currentTrack?.cover_art_path && currentTrack?.id) {
        try {
          const token = localStorage.getItem('accessToken');
          const response = await fetch(`${API_URL}/stream/tracks/${currentTrack.id}/cover`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            currentBlobUrl = blobUrl;
            setCoverUrl(blobUrl);
          } else {
            setCoverUrl(null);
          }
        } catch (error) {
          console.error('Error loading cover art:', error);
          setCoverUrl(null);
        }
      } else {
        setCoverUrl(null);
      }
    };

    loadCoverArt();

    return () => {
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [currentTrack]);

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRepeatClick = () => {
    setRepeat(repeat);
  };

  const isLiked = currentTrack ? likedTracks.has(currentTrack.id) : false;

  if (!currentTrack) return null;

  return (
    <>
      <QueuePanel />
      <EqualizerPanel audioElement={audioRef} />
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
        {/* Colonna 1: Album Art + Info Traccia */}
        <div className="player-left">
          <div className="player-album-art">
            {coverUrl ? (
              <img 
                src={coverUrl} 
                alt={currentTrack.title}
                className={`album-art-image ${isPlaying ? 'playing' : ''}`}
              />
            ) : (
              <div className="album-art-placeholder">
                <Music size={40} />
              </div>
            )}
          </div>
          <div className="player-track-info">
            <div className="track-title">{currentTrack.title || 'Titolo sconosciuto'}</div>
            <div className="track-artist">{currentTrack.artist || 'Artista sconosciuto'}</div>
          </div>
          <button
            className={`like-btn ${isLiked ? 'liked' : ''}`}
            onClick={() => toggleLike(currentTrack.id)}
            title={isLiked ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
          >
            <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
          </button>
        </div>

        {/* Colonna 2: Controlli Riproduzione */}
        <div className="player-center">
          <div className="control-buttons">
            <button 
              onClick={toggleShuffle} 
              className={`control-btn shuffle-btn ${shuffle ? 'active' : ''}`}
              title="Shuffle"
            >
              <Shuffle size={18} />
            </button>
            <button onClick={previous} className="control-btn" title="Precedente">
              <SkipBack size={20} />
            </button>
            <button
              onClick={isPlaying ? pause : play}
              className="control-btn play-btn"
              title={isPlaying ? 'Pausa' : 'Riproduci'}
            >
              {isPlaying ? <Pause size={28} /> : <Play size={28} />}
            </button>
            <button onClick={next} className="control-btn" title="Successivo">
              <SkipForward size={20} />
            </button>
            <button
              onClick={handleRepeatClick}
              className={`control-btn repeat-btn ${repeat !== 'off' ? 'active' : ''}`}
              title={repeat === 'one' ? 'Ripeti traccia' : repeat === 'all' ? 'Ripeti playlist' : 'Ripeti'}
            >
              {repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
            </button>
          </div>
          <div className="progress-container" onClick={handleSeek}>
            {isPlaying && (
              <div className="waveform-container">
                <AudioWaveform audioElement={audioRef} isPlaying={isPlaying} />
              </div>
            )}
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
            <div className="time-display">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>

        {/* Colonna 3: Volume + Queue + Equalizer */}
        <div className="player-right">
          <button
            onClick={toggleEqualizer}
            className={`control-btn equalizer-btn ${showEqualizer ? 'active' : ''}`}
            title="Equalizzatore"
          >
            <Sliders size={18} />
          </button>
          <button
            onClick={toggleQueue}
            className={`control-btn queue-btn ${showQueue ? 'active' : ''}`}
            title="Coda di riproduzione"
          >
            <ListMusic size={18} />
          </button>
          <div className="player-volume">
            <button
              onClick={() => setVolume(volume > 0 ? 0 : 1)}
              className="volume-icon-btn"
              title={volume > 0 ? 'Muta' : 'Riattiva audio'}
            >
              {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="volume-slider"
              title={`Volume: ${Math.round(volume * 100)}%`}
            />
            <span className="volume-percentage">{Math.round(volume * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

