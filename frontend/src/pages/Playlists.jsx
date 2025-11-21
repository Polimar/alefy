import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Plus, Music } from 'lucide-react';
import './Playlists.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function Playlists() {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistDescription, setPlaylistDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [coverUrls, setCoverUrls] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    loadPlaylists();
  }, []);

  const loadPlaylists = async () => {
    try {
      setLoading(true);
      const response = await api.get('/playlists');
      setPlaylists(response.data.data.playlists);
    } catch (error) {
      console.error('Error loading playlists:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    if (!playlistName.trim()) return;

    try {
      setCreating(true);
      const payload = {
        name: playlistName.trim(),
      };
      if (playlistDescription.trim()) {
        payload.description = playlistDescription.trim();
      }
      await api.post('/playlists', payload);
      setShowModal(false);
      setPlaylistName('');
      setPlaylistDescription('');
      loadPlaylists();
    } catch (error) {
      console.error('Error creating playlist:', error);
      alert('Errore nella creazione della playlist');
    } finally {
      setCreating(false);
    }
  };

  const handlePlaylistClick = (playlistId) => {
    navigate(`/playlists/${playlistId}`);
  };

  const getCoverArtUrl = async (playlist) => {
    if (!playlist.first_track_cover_art_path || !playlist.first_track_id) {
      return null;
    }
    
    if (coverUrls[playlist.id]) {
      return coverUrls[playlist.id];
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/stream/tracks/${playlist.first_track_id}/cover`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        setCoverUrls(prev => ({ ...prev, [playlist.id]: blobUrl }));
        return blobUrl;
      }
    } catch (error) {
      console.error('Error loading cover art:', error);
    }
    return null;
  };

  // Carica le cover quando cambiano le playlist
  useEffect(() => {
    playlists.forEach(playlist => {
      if (playlist.first_track_cover_art_path && playlist.first_track_id && !coverUrls[playlist.id]) {
        getCoverArtUrl(playlist);
      }
    });
  }, [playlists]);

  return (
    <div className="playlists">
      <div className="playlists-header">
        <h1>Playlist</h1>
        <button 
          className="create-playlist-btn"
          onClick={() => setShowModal(true)}
        >
          <Plus size={20} />
          Crea Playlist
        </button>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Crea Nuova Playlist</h2>
            <form onSubmit={handleCreatePlaylist}>
              <div className="form-group">
                <label htmlFor="playlist-name">Nome Playlist *</label>
                <input
                  id="playlist-name"
                  type="text"
                  value={playlistName}
                  onChange={(e) => setPlaylistName(e.target.value)}
                  placeholder="Nome della playlist"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="playlist-description">Descrizione</label>
                <textarea
                  id="playlist-description"
                  value={playlistDescription}
                  onChange={(e) => setPlaylistDescription(e.target.value)}
                  placeholder="Descrizione (opzionale)"
                  rows={3}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setPlaylistName('');
                    setPlaylistDescription('');
                  }}
                  className="btn-cancel"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={creating || !playlistName.trim()}
                  className="btn-primary"
                >
                  {creating ? 'Creazione...' : 'Crea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading">Caricamento...</div>
      ) : playlists.length === 0 ? (
        <div className="empty-state">
          <Music size={48} />
          <p>Nessuna playlist</p>
          <button 
            className="create-first-playlist-btn"
            onClick={() => setShowModal(true)}
          >
            Crea la tua prima playlist
          </button>
        </div>
      ) : (
        <div className="playlists-grid">
          {playlists.map((playlist) => (
            <div 
              key={playlist.id} 
              className="playlist-card"
              onClick={() => handlePlaylistClick(playlist.id)}
            >
              <div className="playlist-icon">
                {coverUrls[playlist.id] ? (
                  <img 
                    src={coverUrls[playlist.id]} 
                    alt={playlist.name}
                    className="playlist-thumbnail"
                  />
                ) : (
                  <Music size={32} />
                )}
              </div>
              <div className="playlist-name">{playlist.name}</div>
              <div className="playlist-info">
                {playlist.track_count || 0} brani
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

