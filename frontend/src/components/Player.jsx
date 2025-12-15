import { useEffect, useRef, useState } from 'react';
import usePlayerStore from '../store/playerStore';
import api from '../utils/api';
import { getTrackOffline } from '../utils/offlineStorage';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Heart, ListMusic, Music, Sliders, Rewind, FastForward, X } from 'lucide-react';
import AudioWaveform from './AudioWaveform';
import QueuePanel from './QueuePanel';
import EqualizerPanel from './EqualizerPanel';
import './Player.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function Player() {
  const audioRef = useRef(null);
  const blobUrlRef = useRef(null);
  const volumeBtnRef = useRef(null);
  const volumeModalRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [volumeModalPosition, setVolumeModalPosition] = useState({ bottom: 0, right: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showMiniQueue, setShowMiniQueue] = useState(false);
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    likedTracks,
    showQueue,
    showEqualizer,
    showVolumeModal,
    queue,
    play,
    pause,
    setCurrentTime,
    setDuration,
    setVolume,
    next,
    previous,
    toggleLike,
    toggleQueue,
    toggleEqualizer,
    toggleVolumeModal,
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
      // Se c'è una queue, passa al prossimo brano
      if (queue.length > 0) {
        next();
      } else {
        // Altrimenti ferma la riproduzione
        pause();
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
  }, [setCurrentTime, setDuration, next, pause, queue.length, isPlaying]);

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

        // Carica il blob per supportare seek
        let response = await fetch(streamUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        // Se fallisce con 401, prova a refreshare il token
        if (!response.ok && response.status === 401) {
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

                // Riprova con il nuovo token
                response = await fetch(streamUrl, {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                  },
                });

                if (!response.ok) {
                  throw new Error(`Errore ${response.status}: ${response.statusText}`);
                }
              } else {
                throw new Error('Token refresh fallito');
              }
            } catch (refreshError) {
              console.error('Token refresh failed:', refreshError);
              throw new Error('Errore di autenticazione. Effettua il login.');
            }
          } else {
            throw new Error('Token non disponibile. Effettua il login.');
          }
        } else if (!response.ok) {
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

  const handleSkipBackward = (seconds = 10) => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    const newTime = Math.max(0, currentTime - seconds);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleSkipForward = (seconds = 10) => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    const newTime = Math.min(duration, currentTime + seconds);
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
          // Usa api (axios) invece di fetch per beneficiare dell'interceptor che gestisce il refresh token
          const response = await api.get(`/stream/tracks/${currentTrack.id}/cover`, {
            responseType: 'blob',
          });

          if (response.status === 200) {
            const blob = response.data;
            const blobUrl = URL.createObjectURL(blob);
            currentBlobUrl = blobUrl;
            setCoverUrl(blobUrl);
          } else {
            setCoverUrl(null);
          }
        } catch (error) {
          console.error('Error loading cover art:', error.response?.status || error.message);
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

  const isLiked = currentTrack ? likedTracks.has(currentTrack.id) : false;

  // Calcola posizione del modal del volume quando viene aperto
  useEffect(() => {
    if (showVolumeModal && volumeBtnRef.current) {
      // Su mobile il modal è centrato, non serve calcolo dinamico
      if (isMobile) {
        setVolumeModalPosition({ bottom: 96, right: 0 });
      } else {
        const rect = volumeBtnRef.current.getBoundingClientRect();
        const modalHeight = 300;
        const margin = 12;
        setVolumeModalPosition({
          bottom: window.innerHeight - rect.top + margin,
          right: window.innerWidth - rect.right,
        });
      }
    }
  }, [showVolumeModal, isMobile]);

  // Rileva viewport mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
      if (window.innerWidth > 768) {
        setIsExpanded(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleExpand = () => setIsExpanded((prev) => !prev);
  const toggleMiniQueue = () => setShowMiniQueue((prev) => !prev);

  // Il player è sempre visibile, anche senza traccia corrente
  // if (!currentTrack) return null;

  // Desktop layout
  const renderDesktop = () => (
    <div className="player">
      <audio ref={audioRef} />
      {error && (
        <div className="player-error">
          {error}
        </div>
      )}
      {loading && (
        <div className="player-loading">
          Caricamento...
        </div>
      )}
      <div className="player-content">
        <div className="player-left">
          <div className="player-album-art">
            {currentTrack && coverUrl ? (
              <img 
                src={coverUrl} 
                alt={currentTrack.title || 'Track'}
                className={`album-art-image ${isPlaying ? 'playing' : ''}`}
              />
            ) : (
              <div className="album-art-placeholder">
                <Music size={40} />
              </div>
            )}
          </div>
          <div className="player-track-info">
            <div className="track-title">{currentTrack?.title || 'Nessuna traccia selezionata'}</div>
            <div className="track-artist">{currentTrack?.artist || 'Seleziona una traccia per iniziare'}</div>
          </div>
          {currentTrack && (
            <button
              className={`like-btn ${isLiked ? 'liked' : ''}`}
              onClick={() => toggleLike(currentTrack.id)}
              title={isLiked ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
            >
              <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
            </button>
          )}
        </div>

        <div className="player-center">
          <div className="control-buttons">
            <button 
              onClick={() => handleSkipBackward(30)} 
              className="control-btn skip-btn" 
              title="Indietro 30 secondi"
              disabled={!currentTrack}
            >
              <Rewind size={18} />
            </button>
            <button 
              onClick={() => handleSkipBackward(10)} 
              className="control-btn skip-btn" 
              title="Indietro 10 secondi"
              disabled={!currentTrack}
            >
              <SkipBack size={18} />
            </button>
            <button onClick={previous} className="control-btn" title="Precedente" disabled={!currentTrack || queue.length === 0}>
              <SkipBack size={22} />
            </button>
            <button
              onClick={isPlaying ? pause : play}
              className="control-btn play-btn large"
              title={isPlaying ? 'Pausa' : 'Riproduci'}
              disabled={!currentTrack}
            >
              {isPlaying ? <Pause size={32} /> : <Play size={32} />}
            </button>
            <button onClick={next} className="control-btn" title="Successivo" disabled={!currentTrack || queue.length === 0}>
              <SkipForward size={22} />
            </button>
            <button 
              onClick={() => handleSkipForward(10)} 
              className="control-btn skip-btn" 
              title="Avanti 10 secondi"
              disabled={!currentTrack}
            >
              <SkipForward size={18} />
            </button>
            <button 
              onClick={() => handleSkipForward(30)} 
              className="control-btn skip-btn" 
              title="Avanti 30 secondi"
              disabled={!currentTrack}
            >
              <FastForward size={18} />
            </button>
          </div>
          <div className="progress-container" onClick={handleSeek}>
            {currentTrack && (
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

        <div className="player-right">
          <button
            onClick={toggleEqualizer}
            className={`control-btn equalizer-btn ${showEqualizer ? 'active' : ''}`}
            title="Equalizzatore"
          >
            <Sliders size={18} />
          </button>
          {queue.length > 0 && (
            <div className="queue-popover-wrapper">
              <button
                onClick={toggleMiniQueue}
                className={`control-btn queue-btn ${showMiniQueue ? 'active' : ''}`}
                title="Coda di riproduzione"
              >
                <ListMusic size={18} />
              </button>
              {showMiniQueue && (
                <div className="queue-popover">
                  <div className="queue-popover-header">
                    <span>Coda</span>
                    <button onClick={toggleMiniQueue} className="queue-popover-close">×</button>
                  </div>
                  <div className="queue-popover-list">
                    {queue.slice(0, 6).map((track, idx) => (
                      <div key={track.id} className="queue-popover-item">
                        <span className="queue-popover-index">{idx + 1}</span>
                        <div className="queue-popover-info">
                          <div className="queue-popover-title">{track.title || 'Senza titolo'}</div>
                          <div className="queue-popover-artist">{track.artist || 'Sconosciuto'}</div>
                        </div>
                      </div>
                    ))}
                    {queue.length > 6 && (
                      <div className="queue-popover-more">+ {queue.length - 6} altri</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="volume-btn-wrapper">
            <button
              ref={volumeBtnRef}
              onClick={toggleVolumeModal}
              className="control-btn volume-btn"
              title={`Volume: ${Math.round(volume * 100)}%`}
            >
              {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            
            {showVolumeModal && (
              <>
                <div className="volume-modal-overlay" onClick={toggleVolumeModal}></div>
                <div 
                  ref={volumeModalRef}
                  className="volume-modal" 
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    bottom: `${volumeModalPosition.bottom}px`,
                    right: `${volumeModalPosition.right}px`,
                  }}
                >
                  <div className="volume-modal-header">
                    <h3>Volume</h3>
                    <button onClick={toggleVolumeModal} className="volume-modal-close">×</button>
                  </div>
                  <div className="volume-modal-content">
                    <button
                      onClick={() => setVolume(volume > 0 ? 0 : 1)}
                      className="volume-icon-btn-modal"
                      title={volume > 0 ? 'Muta' : 'Riattiva audio'}
                    >
                      {volume === 0 ? <VolumeX size={24} /> : <Volume2 size={24} />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="volume-slider-modal"
                      title={`Volume: ${Math.round(volume * 100)}%`}
                      style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                    />
                    <span className="volume-percentage-modal">{Math.round(volume * 100)}%</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Mobile bottom bar + fullscreen
  const renderMobile = () => (
    <div className="player player-mobile">
      <audio ref={audioRef} />
      <div className="player-mobile-bar" onClick={!isExpanded ? toggleExpand : undefined}>
        <div className="player-mobile-info">
          <div className="player-album-art small">
            {currentTrack && coverUrl ? (
              <img 
                src={coverUrl} 
                alt={currentTrack.title || 'Track'}
                className={`album-art-image ${isPlaying ? 'playing' : ''}`}
              />
            ) : (
              <div className="album-art-placeholder">
                <Music size={28} />
              </div>
            )}
          </div>
          <div className="player-track-info">
            <div className="track-title">{currentTrack?.title || 'Nessuna traccia'}</div>
            <div className="track-artist">{currentTrack?.artist || 'Seleziona un brano'}</div>
          </div>
        </div>
        <div className="player-mobile-actions">
          <button
            onClick={(e) => { e.stopPropagation(); previous(); }}
            className="control-btn"
            title="Precedente"
            disabled={!currentTrack || queue.length === 0}
          >
            <SkipBack size={18} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); isPlaying ? pause() : play(); }}
            className="control-btn play-btn"
            title={isPlaying ? 'Pausa' : 'Riproduci'}
            disabled={!currentTrack}
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="control-btn"
            title="Successivo"
            disabled={!currentTrack || queue.length === 0}
          >
            <SkipForward size={18} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toggleVolumeModal(); }}
            className="control-btn"
            title={`Volume: ${Math.round(volume * 100)}%`}
          >
            {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </div>
      <div className="player-mobile-mini-progress" onClick={!isExpanded ? handleSeek : undefined}>
        <div className="mini-progress-bar">
          <div
            className="mini-progress-fill"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
          />
        </div>
        <div className="mini-time">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="player-mobile-overlay">
          <div className="player-mobile-header">
            <button className="close-overlay" onClick={toggleExpand}>
              <X size={24} />
            </button>
          </div>
          <div className="player-mobile-body">
            <div className="player-album-art large">
              {currentTrack && coverUrl ? (
                <img 
                  src={coverUrl} 
                  alt={currentTrack.title || 'Track'}
                  className={`album-art-image ${isPlaying ? 'playing' : ''}`}
                />
              ) : (
                <div className="album-art-placeholder">
                  <Music size={48} />
                </div>
              )}
            </div>
            <div className="player-track-info mobile">
              <div className="track-title">{currentTrack?.title || 'Nessuna traccia'}</div>
              <div className="track-artist">{currentTrack?.artist || 'Seleziona un brano'}</div>
            </div>
            <div className="progress-container mobile" onClick={handleSeek}>
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
            <div className="control-buttons mobile">
              <button 
                onClick={() => handleSkipBackward(10)} 
                className="control-btn skip-btn" 
                title="Indietro 10 secondi"
                disabled={!currentTrack}
              >
                <SkipBack size={18} />
              </button>
              <button onClick={previous} className="control-btn" title="Precedente" disabled={!currentTrack || queue.length === 0}>
                <SkipBack size={22} />
              </button>
              <button
                onClick={isPlaying ? pause : play}
                className="control-btn play-btn large"
                title={isPlaying ? 'Pausa' : 'Riproduci'}
                disabled={!currentTrack}
              >
                {isPlaying ? <Pause size={32} /> : <Play size={32} />}
              </button>
              <button onClick={next} className="control-btn" title="Successivo" disabled={!currentTrack || queue.length === 0}>
                <SkipForward size={22} />
              </button>
              <button 
                onClick={() => handleSkipForward(10)} 
                className="control-btn skip-btn" 
                title="Avanti 10 secondi"
                disabled={!currentTrack}
              >
                <SkipForward size={18} />
              </button>
            </div>
            <div className="player-mobile-bottom">
              <div className="volume-btn-wrapper">
                <button
                  onClick={toggleVolumeModal}
                  className="control-btn volume-btn"
                  title={`Volume: ${Math.round(volume * 100)}%`}
                >
                  {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              </div>
              {queue.length > 0 && (
                <div className="queue-preview-mobile">
                  <span>Coda ({queue.length})</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <QueuePanel />
      <EqualizerPanel audioElement={audioRef} />
      {isMobile ? renderMobile() : renderDesktop()}

      {/* Modal Volume - anche per mobile, con stile dedicato */}
      {showVolumeModal && (
        <>
          <div className="volume-modal-overlay" onClick={toggleVolumeModal}></div>
          <div 
            ref={volumeModalRef}
            className={`volume-modal ${isMobile ? 'mobile' : ''}`} 
            onClick={(e) => e.stopPropagation()}
            style={
              isMobile
                ? { bottom: '96px', left: '12px', right: '12px' }
                : { bottom: `${volumeModalPosition.bottom}px`, right: `${volumeModalPosition.right}px` }
            }
          >
            <div className="volume-modal-header">
              <h3>Volume</h3>
              <button onClick={toggleVolumeModal} className="volume-modal-close">×</button>
            </div>
            <div className="volume-modal-content">
              <button
                onClick={() => setVolume(volume > 0 ? 0 : 1)}
                className="volume-icon-btn-modal"
                title={volume > 0 ? 'Muta' : 'Riattiva audio'}
              >
                {volume === 0 ? <VolumeX size={24} /> : <Volume2 size={24} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="volume-slider-modal"
                title={`Volume: ${Math.round(volume * 100)}%`}
                style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
              />
              <span className="volume-percentage-modal">{Math.round(volume * 100)}%</span>
            </div>
          </div>
        </>
      )}
    </>
  );
}

