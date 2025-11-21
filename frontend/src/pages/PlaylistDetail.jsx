import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import usePlayerStore from '../store/playerStore';
import { Play, Trash2, ArrowLeft, Music, Shuffle, Repeat, Repeat1 } from 'lucide-react';
import './PlaylistDetail.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function PlaylistDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [coverUrl, setCoverUrl] = useState(null);
  const { 
    setCurrentTrack, 
    setQueue, 
    play,
    shuffle,
    repeat,
    toggleShuffle,
    setRepeat
  } = usePlayerStore();

  useEffect(() => {
    loadPlaylist();
  }, [id]);

  // Carica la cover art della prima traccia quando cambiano le tracce
  useEffect(() => {
    let currentBlobUrl = null;

    const loadCoverArt = async () => {
      // Revoca il vecchio blob URL se esiste
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
      }

      if (tracks.length > 0 && tracks[0].cover_art_path && tracks[0].id) {
        try {
          const token = localStorage.getItem('accessToken');
          const response = await fetch(`${API_URL}/stream/tracks/${tracks[0].id}/cover`, {
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

    // Cleanup: revoca il blob URL quando il componente si smonta o cambiano le tracce
    return () => {
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [tracks]);

  const loadPlaylist = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/playlists/${id}`);
      const playlistData = response.data.data.playlist;
      setPlaylist(playlistData);
      setTracks(playlistData.tracks || []);
    } catch (error) {
      console.error('Error loading playlist:', error);
      alert('Errore nel caricamento della playlist');
    } finally {
      setLoading(false);
    }
  };

  const handlePlayPlaylist = () => {
    if (tracks.length === 0) return;
    // Applica shuffle se attivo
    let tracksToPlay = [...tracks];
    if (shuffle) {
      tracksToPlay = [...tracks].sort(() => Math.random() - 0.5);
    }
    setQueue(tracksToPlay);
    setCurrentTrack(tracksToPlay[0]);
    // Chiama play() dopo setCurrentTrack - il Player gestirà l'auto-play quando l'audio è pronto
    // Usa requestAnimationFrame per assicurarsi che lo stato sia aggiornato
    requestAnimationFrame(() => {
      play();
    });
  };

  const handlePlayTrack = (track) => {
    // Applica shuffle se attivo
    let tracksToPlay = [...tracks];
    if (shuffle) {
      tracksToPlay = [...tracks].sort(() => Math.random() - 0.5);
      // Trova la posizione del track corrente nella lista shuffleata
      const trackIndex = tracksToPlay.findIndex(t => t.id === track.id);
      if (trackIndex !== -1) {
        // Sposta il track corrente all'inizio
        tracksToPlay = [track, ...tracksToPlay.filter(t => t.id !== track.id)];
      }
    } else {
      // Trova l'indice del track e riordina dalla sua posizione
      const trackIndex = tracks.findIndex(t => t.id === track.id);
      if (trackIndex !== -1) {
        tracksToPlay = [...tracks.slice(trackIndex), ...tracks.slice(0, trackIndex)];
      }
    }
    setQueue(tracksToPlay);
    setCurrentTrack(track);
    // Chiama play() dopo setCurrentTrack - il Player gestirà l'auto-play quando l'audio è pronto
    requestAnimationFrame(() => {
      play();
    });
  };

  const handleRemoveTrack = async (trackId) => {
    if (!confirm('Rimuovere questa traccia dalla playlist?')) return;

    try {
      await api.delete(`/playlists/${id}/tracks/${trackId}`);
      loadPlaylist();
    } catch (error) {
      console.error('Error removing track:', error);
      alert('Errore nella rimozione della traccia');
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTotalDuration = (tracks) => {
    const total = tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
    const hours = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  if (loading) {
    return (
      <div className="playlist-detail">
        <div className="loading">Caricamento...</div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="playlist-detail">
        <div className="error">Playlist non trovata</div>
      </div>
    );
  }

  return (
    <div className="playlist-detail">
      <button className="back-btn" onClick={() => navigate('/playlists')}>
        <ArrowLeft size={20} />
        Indietro
      </button>

      <div className="playlist-header">
        <div className="playlist-cover">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={playlist.name}
            />
          ) : (
            <div className="playlist-cover-placeholder">
              <Music size={64} />
            </div>
          )}
        </div>
        <div className="playlist-info">
          <div className="playlist-type">Playlist</div>
          <h1>{playlist.name}</h1>
          {playlist.description && (
            <p className="playlist-description">{playlist.description}</p>
          )}
          <div className="playlist-stats">
            {tracks.length} brani • {formatTotalDuration(tracks)}
          </div>
          <div className="playlist-controls">
            <button className="play-playlist-btn" onClick={handlePlayPlaylist}>
              <Play size={20} />
              Riproduci
            </button>
            <button 
              className={`control-btn ${shuffle ? 'active' : ''}`}
              onClick={toggleShuffle}
              title="Shuffle"
            >
              <Shuffle size={18} />
            </button>
            <button 
              className={`control-btn ${repeat !== 'off' ? 'active' : ''}`}
              onClick={() => {
                if (repeat === 'off') setRepeat('all');
                else if (repeat === 'all') setRepeat('one');
                else setRepeat('off');
              }}
              title={repeat === 'off' ? 'Repeat' : repeat === 'all' ? 'Repeat All' : 'Repeat One'}
            >
              {repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
            </button>
          </div>
        </div>
      </div>

      <div className="playlist-tracks">
        {tracks.length === 0 ? (
          <div className="empty-tracks">
            <Music size={48} />
            <p>Nessuna traccia in questa playlist</p>
          </div>
        ) : (
          <>
            {/* Desktop: Tabella */}
            <table className="tracks-table tracks-table-desktop">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Titolo</th>
                  <th>Album</th>
                  <th>Durata</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tracks.map((track, index) => (
                  <tr key={track.id} className="track-row">
                    <td className="track-number">{index + 1}</td>
                    <td className="track-info">
                      <div className="track-title">{track.title}</div>
                      <div className="track-artist">{track.artist || 'Artista sconosciuto'}</div>
                    </td>
                    <td className="track-album">{track.album || '-'}</td>
                    <td className="track-duration">{formatDuration(track.duration)}</td>
                    <td className="track-actions">
                      <button
                        className="action-btn"
                        onClick={() => handlePlayTrack(track)}
                        title="Riproduci"
                      >
                        <Play size={16} />
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => handleRemoveTrack(track.id)}
                        title="Rimuovi"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile: Cards */}
            <div className="tracks-table-mobile">
              {tracks.map((track, index) => (
                <div key={track.id} className="track-card">
                  <div className="track-card-number">{index + 1}</div>
                  <div className="track-card-info">
                    <div className="track-card-title">{track.title}</div>
                    <div className="track-card-artist">{track.artist || 'Artista sconosciuto'}</div>
                  </div>
                  <div className="track-card-duration">{formatDuration(track.duration)}</div>
                  <div className="track-card-actions">
                    <button
                      className="action-btn"
                      onClick={() => handlePlayTrack(track)}
                      title="Riproduci"
                    >
                      <Play size={18} />
                    </button>
                    <button
                      className="action-btn"
                      onClick={() => handleRemoveTrack(track.id)}
                      title="Rimuovi"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

