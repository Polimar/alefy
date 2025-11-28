import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Music, Rewind, FastForward } from 'lucide-react';
import './Share.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function Share() {
  const { token } = useParams();
  const audioRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sharedData, setSharedData] = useState(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [showVolumeModal, setShowVolumeModal] = useState(false);

  useEffect(() => {
    const loadSharedResource = async () => {
      try {
        setLoading(true);
        setError(null); // Reset error quando si ricarica
        // Aggiungi cache: 'no-cache' per evitare problemi su mobile
        const response = await fetch(`${API_URL}/share/${token}`, {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Risorsa non trovata o non più disponibile');
        }
        
        const data = await response.json();
        
        // Verifica che i dati siano validi
        if (!data.data) {
          throw new Error('Dati non validi ricevuti dal server');
        }
        
        // Verifica che per le playlist ci siano le tracce
        if (data.data.type === 'playlist' && (!data.data.playlist || !Array.isArray(data.data.playlist.tracks))) {
          throw new Error('Playlist non valida o senza tracce');
        }
        
        setSharedData(data.data);
      } catch (err) {
        console.error('Error loading shared resource:', err);
        setError(err.message || 'Errore nel caricamento della risorsa condivisa');
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      loadSharedResource();
    }
  }, [token]);

  const currentTrack = sharedData?.type === 'track' 
    ? sharedData.track 
    : sharedData?.type === 'playlist' && sharedData.playlist.tracks.length > 0
    ? sharedData.playlist.tracks[currentTrackIndex]
    : null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

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

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('ended', () => {
      if (sharedData?.type === 'playlist' && currentTrackIndex < sharedData.playlist.tracks.length - 1) {
        setCurrentTrackIndex(currentTrackIndex + 1);
      } else {
        setIsPlaying(false);
      }
    });

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('durationchange', updateDuration);
      audio.removeEventListener('ended', () => {});
    };
  }, [currentTrack, currentTrackIndex, sharedData]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (isPlaying) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          if (err.name !== 'AbortError') {
            console.error('Error playing audio:', err);
            setIsPlaying(false);
          }
        });
      }
    } else {
      audio.pause();
    }
  }, [isPlaying, currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const loadAudio = async () => {
      try {
        // Reset audio per evitare problemi su mobile
        audio.pause();
        audio.src = '';
        audio.load();
        
        // Piccolo delay per assicurarsi che il reset sia completato
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const streamUrl = `${API_URL}/stream/tracks/${currentTrack.id}?token=${token}`;
        audio.crossOrigin = 'anonymous';
        audio.src = streamUrl;
        
        // Aspetta che l'audio sia pronto prima di fare load
        await new Promise((resolve, reject) => {
          const handleCanPlay = () => {
            audio.removeEventListener('canplay', handleCanPlay);
            audio.removeEventListener('error', handleError);
            resolve();
          };
          const handleError = (e) => {
            audio.removeEventListener('canplay', handleCanPlay);
            audio.removeEventListener('error', handleError);
            reject(new Error('Errore nel caricamento dell\'audio'));
          };
          audio.addEventListener('canplay', handleCanPlay);
          audio.addEventListener('error', handleError);
          audio.load();
        });
        
        if (isPlaying) {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            await playPromise;
          }
        }
      } catch (err) {
        console.error('Error loading audio:', err);
        setError('Errore nel caricamento dell\'audio');
        setIsPlaying(false);
      }
    };

    loadAudio();
  }, [currentTrack, token, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

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

  const handlePrevious = () => {
    if (sharedData?.type === 'playlist' && currentTrackIndex > 0) {
      setCurrentTrackIndex(currentTrackIndex - 1);
    }
  };

  const handleNext = () => {
    if (sharedData?.type === 'playlist' && currentTrackIndex < sharedData.playlist.tracks.length - 1) {
      setCurrentTrackIndex(currentTrackIndex + 1);
    }
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCoverUrl = () => {
    if (!currentTrack?.cover_art_path) return null;
    return `${API_URL}/stream/tracks/${currentTrack.id}/cover?token=${token}`;
  };

  if (loading) {
    return (
      <div className="share-page">
        <div className="share-loading">Caricamento...</div>
      </div>
    );
  }

  if (error || !sharedData) {
    return (
      <div className="share-page">
        <div className="share-error">
          <Music size={48} />
          <h2>Risorsa non disponibile</h2>
          <p>{error || 'La risorsa condivisa non è più disponibile'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="share-page">
      <div className="share-container">
        {/* Header con cover e info */}
        <div className="share-header">
          <div className="share-cover">
            {getCoverUrl() ? (
              <img src={getCoverUrl()} alt={currentTrack?.title || 'Cover'} />
            ) : (
              <div className="share-cover-placeholder">
                <Music size={64} />
              </div>
            )}
          </div>
          <div className="share-info">
            <h1>{sharedData.type === 'track' ? currentTrack?.title : sharedData.playlist.name}</h1>
            <p className="share-artist">
              {sharedData.type === 'track' 
                ? currentTrack?.artist || 'Artista sconosciuto'
                : sharedData.playlist.creator_username || 'Playlist condivisa'}
            </p>
            {sharedData.type === 'playlist' && (
              <p className="share-meta">
                {sharedData.playlist.tracks.length} brani
              </p>
            )}
          </div>
        </div>

        {/* Lista tracce (solo per playlist) */}
        {sharedData.type === 'playlist' && (
          <div className="share-tracks">
            <h2>Tracce</h2>
            <div className="share-track-list">
              {sharedData.playlist.tracks.map((track, index) => (
                <div
                  key={track.id}
                  className={`share-track-item ${index === currentTrackIndex ? 'active' : ''}`}
                  onClick={() => {
                    setCurrentTrackIndex(index);
                    setIsPlaying(true);
                  }}
                >
                  <div className="share-track-number">{index + 1}</div>
                  <div className="share-track-info">
                    <div className="share-track-title">{track.title}</div>
                    <div className="share-track-artist">{track.artist || 'Artista sconosciuto'}</div>
                  </div>
                  <div className="share-track-duration">{formatTime(track.duration)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Player */}
        {currentTrack && (
          <div className="share-player">
            <div className="share-player-info">
              <div className="share-player-track-title">{currentTrack.title}</div>
              <div className="share-player-track-artist">{currentTrack.artist || 'Artista sconosciuto'}</div>
            </div>
            <div className="share-player-controls">
              <button 
                onClick={() => handleSkipBackward(30)} 
                className="share-control-btn" 
                title="Indietro 30 secondi"
                disabled={!currentTrack}
              >
                <Rewind size={16} />
              </button>
              <button 
                onClick={() => handleSkipBackward(10)} 
                className="share-control-btn" 
                title="Indietro 10 secondi"
                disabled={!currentTrack}
              >
                <SkipBack size={16} />
              </button>
              <button 
                onClick={handlePrevious} 
                className="share-control-btn" 
                title="Precedente"
                disabled={sharedData?.type !== 'playlist' || currentTrackIndex === 0}
              >
                <SkipBack size={20} />
              </button>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="share-control-btn share-play-btn"
                title={isPlaying ? 'Pausa' : 'Riproduci'}
                disabled={!currentTrack}
              >
                {isPlaying ? <Pause size={28} /> : <Play size={28} />}
              </button>
              <button 
                onClick={handleNext} 
                className="share-control-btn" 
                title="Successivo"
                disabled={sharedData?.type !== 'playlist' || currentTrackIndex >= (sharedData.playlist.tracks.length - 1)}
              >
                <SkipForward size={20} />
              </button>
              <button 
                onClick={() => handleSkipForward(10)} 
                className="share-control-btn" 
                title="Avanti 10 secondi"
                disabled={!currentTrack}
              >
                <SkipForward size={16} />
              </button>
              <button 
                onClick={() => handleSkipForward(30)} 
                className="share-control-btn" 
                title="Avanti 30 secondi"
                disabled={!currentTrack}
              >
                <FastForward size={16} />
              </button>
            </div>
            <div className="share-progress-container" onClick={handleSeek}>
              <div className="share-progress-bar">
                <div
                  className="share-progress-fill"
                  style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>
              <div className="share-time-display">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
            <div className="share-volume">
              <button
                onClick={() => setShowVolumeModal(!showVolumeModal)}
                className="share-volume-btn"
                title={`Volume: ${Math.round(volume * 100)}%`}
              >
                {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              {showVolumeModal && (
                <>
                  <div className="share-volume-modal-overlay" onClick={() => setShowVolumeModal(false)}></div>
                  <div className="share-volume-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="share-volume-modal-header">
                      <h3>Volume</h3>
                      <button onClick={() => setShowVolumeModal(false)} className="share-volume-modal-close">×</button>
                    </div>
                    <div className="share-volume-modal-content">
                      <button
                        onClick={() => setVolume(volume > 0 ? 0 : 1)}
                        className="share-volume-icon-btn"
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
                        className="share-volume-slider"
                        title={`Volume: ${Math.round(volume * 100)}%`}
                        orient="vertical"
                      />
                      <span className="share-volume-percentage">{Math.round(volume * 100)}%</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      <audio ref={audioRef} />
    </div>
  );
}

