import { useState, useEffect } from 'react';
import api from '../utils/api';
import usePlayerStore from '../store/playerStore';
import { Play, Music, MoreVertical, Plus, Trash2 } from 'lucide-react';
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
  const { setCurrentTrack, setQueue, play } = usePlayerStore();

  useEffect(() => {
    loadTracks();
    loadPlaylists();
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

  const handleTrackClick = (track) => {
    setQueue(tracks);
    setCurrentTrack(track);
    play();
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
      alert('Traccia aggiunta alla playlist!');
    } catch (error) {
      console.error('Error adding track to playlist:', error);
      alert('Errore nell\'aggiunta della traccia alla playlist');
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

  const handleMenuClick = (trackId, e) => {
    e.stopPropagation();
    setMenuOpen(menuOpen === trackId ? null : trackId);
  };

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
                    onClick={() => handleTrackClick(track)}
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
    </div>
  );
}

