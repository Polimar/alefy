import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import usePlayerStore from '../store/playerStore';
import { Play, Music, MoreVertical, Plus, Trash2, Scissors } from 'lucide-react';
import './Library.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function Library() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [playlists, setPlaylists] = useState([]);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitTrack, setSplitTrack] = useState(null);
  const [splitTimestamps, setSplitTimestamps] = useState([]);
  const [splitLoading, setSplitLoading] = useState(false);
  const { setCurrentTrack, setQueue, play } = usePlayerStore();
  const searchTimeoutRef = useRef(null);

  // Debounce per la ricerca - evita troppe richieste durante la digitazione
  useEffect(() => {
    // Carica playlists subito
    loadPlaylists();
    
    // Cancella timeout precedente
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Imposta nuovo timeout per la ricerca
    searchTimeoutRef.current = setTimeout(() => {
      loadTracks();
    }, 500); // Attendi 500ms dopo l'ultima digitazione
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search]);

  useEffect(() => {
    // Load cover arts for tracks that have them
    tracks.forEach(track => {
      if (track.cover_art_path && !coverUrls[track.id]) {
        getCoverArtUrl(track).catch(err => console.error('Error loading cover:', err));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  const loadTracks = async () => {
    try {
      setLoading(true);
      const params = search ? { search } : {};
      const response = await api.get('/tracks', { params });
      setTracks(response.data.data.tracks);
    } catch (error) {
      console.error('Error loading tracks:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPlaylists = async () => {
    try {
      const response = await api.get('/playlists');
      setPlaylists(response.data.data.playlists);
    } catch (error) {
      console.error('Error loading playlists:', error);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTrackClick = (track, e) => {
    // Su mobile, apri direttamente il modal per aggiungere alla playlist
    if (window.innerWidth < 768) {
      e?.stopPropagation();
      handleAddToPlaylist(track);
    } else {
      // Su desktop, riproduci la traccia
      setQueue(tracks);
      setCurrentTrack(track);
      play();
    }
  };

  const [coverUrls, setCoverUrls] = useState({});

  const getCoverArtUrl = async (track) => {
    if (!track.cover_art_path) return null;
    if (coverUrls[track.id]) return coverUrls[track.id];

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/stream/tracks/${track.id}/cover`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        setCoverUrls(prev => ({ ...prev, [track.id]: blobUrl }));
        return blobUrl;
      }
    } catch (error) {
      console.error('Error loading cover art:', error);
    }
    return null;
  };

  const handleAddToPlaylist = (track) => {
    setSelectedTrack(track);
    setShowAddToPlaylist(true);
    setMenuOpen(null);
  };

  const handleAddTrackToPlaylist = async (playlistId) => {
    if (!selectedTrack) return;

    try {
      await api.post(`/playlists/${playlistId}/tracks`, {
        track_id: selectedTrack.id,
      });
      setShowAddToPlaylist(false);
      setSelectedTrack(null);
      // Ricarica le playlist per aggiornare i conteggi
      loadPlaylists();
      alert('Traccia aggiunta alla playlist!');
    } catch (error) {
      console.error('Error adding track to playlist:', error);
      const errorMessage = error.response?.data?.message || error.response?.data?.error?.message || 'Errore nell\'aggiunta della traccia alla playlist';
      alert(errorMessage);
    }
  };

  const handleDeleteTrack = async (trackId, e) => {
    e.stopPropagation();
    if (!confirm('Eliminare questa traccia? L\'operazione non può essere annullata.')) return;

    try {
      await api.delete(`/tracks/${trackId}`);
      loadTracks();
      setMenuOpen(null);
    } catch (error) {
      console.error('Error deleting track:', error);
      alert('Errore nell\'eliminazione della traccia');
    }
  };

  const handleSplitTrack = (track, e) => {
    e.stopPropagation();
    setSplitTrack(track);
    setSplitTimestamps([]);
    setShowSplitModal(true);
    setMenuOpen(null);
  };

  const formatTimestamp = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const parseTimestampInput = (input) => {
    const parts = input.trim().split(':');
    if (parts.length === 2) {
      const mins = parseInt(parts[0], 10);
      const secs = parseInt(parts[1], 10);
      if (!isNaN(mins) && !isNaN(secs)) {
        return mins * 60 + secs;
      }
    }
    return null;
  };

  const addTimestamp = () => {
    const startInput = document.getElementById('split-start-time');
    const endInput = document.getElementById('split-end-time');
    const titleInput = document.getElementById('split-track-title');
    
    const startTime = parseTimestampInput(startInput.value);
    const endTime = endInput.value ? parseTimestampInput(endInput.value) : null;
    const title = titleInput.value.trim();
    
    if (startTime === null || !title) {
      alert('Inserisci almeno il tempo di inizio (MM:SS) e il titolo');
      return;
    }
    
    if (endTime !== null && endTime <= startTime) {
      alert('Il tempo di fine deve essere maggiore del tempo di inizio');
      return;
    }
    
    setSplitTimestamps([...splitTimestamps, { startTime, endTime, title }]);
    startInput.value = '';
    endInput.value = '';
    titleInput.value = '';
  };

  const removeTimestamp = (index) => {
    setSplitTimestamps(splitTimestamps.filter((_, i) => i !== index));
  };

  const handleSplitSubmit = async () => {
    if (splitTimestamps.length === 0) {
      alert('Aggiungi almeno un timestamp');
      return;
    }

    setSplitLoading(true);
    try {
      const response = await api.post(`/youtube/split/${splitTrack.id}`, {
        timestamps: splitTimestamps,
        useYouTubeDescription: false,
      });
      
      alert(`Traccia divisa in ${response.data.data.tracks.length} tracce!`);
      setShowSplitModal(false);
      setSplitTrack(null);
      setSplitTimestamps([]);
      loadTracks();
    } catch (error) {
      console.error('Error splitting track:', error);
      const errorMessage = error.response?.data?.message || error.response?.data?.error?.message || 'Errore durante la divisione della traccia';
      alert(errorMessage);
    } finally {
      setSplitLoading(false);
    }
  };

  const handleMenuClick = (trackId, e) => {
    e.stopPropagation();
    e.preventDefault();
    setMenuOpen(menuOpen === trackId ? null : trackId);
  };

  useEffect(() => {
    // Chiudi il menu quando si clicca fuori
    const handleClickOutside = (e) => {
      if (menuOpen && !e.target.closest('.track-actions') && !e.target.closest('.action-menu')) {
        setMenuOpen(null);
      }
    };

    if (menuOpen) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [menuOpen]);

  return (
    <div className="library">
      <div className="library-header">
        <h1>Libreria</h1>
        <input
          type="text"
          placeholder="Cerca brani, artisti, album..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
      </div>
      {loading ? (
        <div className="loading">Caricamento...</div>
      ) : tracks.length === 0 ? (
        <div className="empty-state">
          <Music size={48} />
          <p>Nessun brano trovato</p>
        </div>
      ) : (
        <>
          {/* Desktop: Tabella */}
          <div className="tracks-container">
            <table className="tracks-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Titolo</th>
                  <th>Artista</th>
                  <th>Album</th>
                  <th>Genere</th>
                  <th>Anno</th>
                  <th>Durata</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tracks.map((track) => {
                  const coverUrl = coverUrls[track.id];
                  if (track.cover_art_path && !coverUrl) {
                    getCoverArtUrl(track);
                  }
                  return (
                    <tr
                      key={track.id}
                      className="track-row"
                      onClick={(e) => handleTrackClick(track, e)}
                    >
                      <td className="track-cover-cell">
                        {coverUrl ? (
                          <img
                            src={coverUrl}
                            alt={track.title}
                            className="track-cover"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : (
                          <div className="track-cover-placeholder">
                            <Music size={20} />
                          </div>
                        )}
                      </td>
                      <td className="track-title-cell">
                        <div className="track-title">{track.title || 'Titolo sconosciuto'}</div>
                      </td>
                      <td className="track-artist-cell">
                        {track.artist || 'Artista sconosciuto'}
                      </td>
                      <td className="track-album-cell">
                        {track.album || '-'}
                      </td>
                      <td className="track-genre-cell">
                        {track.genre || '-'}
                      </td>
                      <td className="track-year-cell">
                        {track.year || '-'}
                      </td>
                      <td className="track-duration-cell">
                        {formatDuration(track.duration)}
                      </td>
                      <td className="track-actions-cell">
                        <div className="track-actions">
                          <button
                            className="action-btn"
                            onClick={(e) => handleMenuClick(track.id, e)}
                          >
                            <MoreVertical size={16} />
                          </button>
                          {menuOpen === track.id && (
                            <div className="action-menu" onClick={(e) => e.stopPropagation()}>
                              <button
                                className="action-menu-item"
                                onClick={() => handleAddToPlaylist(track)}
                              >
                                <Plus size={16} />
                                Aggiungi a playlist
                              </button>
                              {track.duration > 1800 && (
                                <button
                                  className="action-menu-item"
                                  onClick={(e) => handleSplitTrack(track, e)}
                                >
                                  <Scissors size={16} />
                                  Dividi in tracce
                                </button>
                              )}
                              <button
                                className="action-menu-item danger"
                                onClick={(e) => handleDeleteTrack(track.id, e)}
                              >
                                <Trash2 size={16} />
                                Elimina
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: Cards */}
          <div className="tracks-table-mobile">
            {tracks.map((track) => {
              const coverUrl = coverUrls[track.id];
              if (track.cover_art_path && !coverUrl) {
                getCoverArtUrl(track);
              }
              return (
                <div
                  key={track.id}
                  className="track-card"
                  onClick={(e) => handleTrackClick(track, e)}
                >
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={track.title}
                      className="track-card-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : (
                    <div className="track-card-cover-placeholder">
                      <Music size={24} />
                    </div>
                  )}
                  <div className="track-card-info">
                    <div className="track-card-title">{track.title || 'Titolo sconosciuto'}</div>
                    <div className="track-card-artist">{track.artist || 'Artista sconosciuto'}</div>
                  </div>
                  <div className="track-card-duration">{formatDuration(track.duration)}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showAddToPlaylist && (
        <div className="modal-overlay" onClick={() => {
          setShowAddToPlaylist(false);
          setSelectedTrack(null);
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Aggiungi a Playlist</h2>
            <p className="modal-subtitle">
              Seleziona una playlist per "{selectedTrack?.title}"
            </p>
            {playlists.length === 0 ? (
              <div className="no-playlists">
                <p>Nessuna playlist disponibile</p>
                <button
                  className="btn-primary"
                  onClick={() => {
                    setShowAddToPlaylist(false);
                    window.location.href = '/playlists';
                  }}
                >
                  Crea Playlist
                </button>
              </div>
            ) : (
              <div className="playlists-list">
                {playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    className="playlist-select-item"
                    onClick={() => handleAddTrackToPlaylist(playlist.id)}
                  >
                    <div className="playlist-select-info">
                      <div className="playlist-select-name">{playlist.name}</div>
                      <div className="playlist-select-count">
                        {playlist.track_count || 0} brani
                      </div>
                    </div>
                    <Plus size={20} />
                  </button>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button
                className="btn-cancel"
                onClick={() => {
                  setShowAddToPlaylist(false);
                  setSelectedTrack(null);
                }}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {showSplitModal && splitTrack && (
        <div className="modal-overlay" onClick={() => {
          setShowSplitModal(false);
          setSplitTrack(null);
          setSplitTimestamps([]);
        }}>
          <div className="modal-content split-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Dividi in Tracce</h2>
            <p className="modal-subtitle">
              Dividi "{splitTrack.title}" in tracce separate usando i timestamp
            </p>
            <p className="modal-info">
              Durata totale: {formatDuration(splitTrack.duration)}
            </p>

            <div className="split-timestamps-form">
              <div className="split-input-group">
                <input
                  type="text"
                  id="split-start-time"
                  placeholder="Inizio (MM:SS)"
                  className="split-time-input"
                />
                <input
                  type="text"
                  id="split-end-time"
                  placeholder="Fine (MM:SS) - opzionale"
                  className="split-time-input"
                />
                <input
                  type="text"
                  id="split-track-title"
                  placeholder="Titolo traccia"
                  className="split-title-input"
                />
                <button
                  type="button"
                  onClick={addTimestamp}
                  className="btn-add-timestamp"
                >
                  Aggiungi
                </button>
              </div>

              {splitTimestamps.length > 0 && (
                <div className="split-timestamps-list">
                  <h3>Tracce da creare ({splitTimestamps.length}):</h3>
                  <ul>
                    {splitTimestamps.map((ts, idx) => (
                      <li key={idx} className="split-timestamp-item">
                        <span className="timestamp-time">
                          {formatTimestamp(ts.startTime)}
                          {ts.endTime ? ` - ${formatTimestamp(ts.endTime)}` : ' - Fine'}
                        </span>
                        <span className="timestamp-title">{ts.title}</span>
                        <button
                          type="button"
                          onClick={() => removeTimestamp(idx)}
                          className="btn-remove-timestamp"
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button
                className="btn-cancel"
                onClick={() => {
                  setShowSplitModal(false);
                  setSplitTrack(null);
                  setSplitTimestamps([]);
                }}
                disabled={splitLoading}
              >
                Annulla
              </button>
              <button
                className="btn-primary"
                onClick={handleSplitSubmit}
                disabled={splitLoading || splitTimestamps.length === 0}
              >
                {splitLoading ? 'Divisione in corso...' : 'Dividi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

