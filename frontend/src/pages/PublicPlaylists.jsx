import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Music, Play, Users } from 'lucide-react';
import './PublicPlaylists.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function PublicPlaylists() {
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [coverUrls, setCoverUrls] = useState({});

  useEffect(() => {
    loadPublicPlaylists();
  }, []);

  const loadPublicPlaylists = async () => {
    try {
      setLoading(true);
      const response = await api.get('/playlists/public');
      setPlaylists(response.data.data.playlists);
    } catch (error) {
      console.error('Error loading public playlists:', error);
      alert('Errore nel caricamento delle playlist pubbliche');
    } finally {
      setLoading(false);
    }
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

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}`;
    }
    return `${mins}:${mins.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="public-playlists">
        <div className="loading">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="public-playlists">
      <div className="public-playlists-header">
        <h1>Scopri Playlist Pubbliche</h1>
        <p>Esplora le playlist condivise dalla community</p>
      </div>

      {playlists.length === 0 ? (
        <div className="empty-playlists">
          <Music size={64} />
          <p>Nessuna playlist pubblica disponibile</p>
        </div>
      ) : (
        <div className="playlists-grid">
          {playlists.map((playlist) => {
            const coverUrl = coverUrls[playlist.id];
            return (
              <div
                key={playlist.id}
                className="playlist-card"
                onClick={() => navigate(`/playlists/${playlist.id}`)}
              >
                <div className="playlist-card-cover">
                  {coverUrl ? (
                    <img src={coverUrl} alt={playlist.name} />
                  ) : (
                    <div className="playlist-card-placeholder">
                      <Music size={48} />
                    </div>
                  )}
                </div>
                <div className="playlist-card-info">
                  <h3 className="playlist-card-name">{playlist.name}</h3>
                  {playlist.description && (
                    <p className="playlist-card-description">{playlist.description}</p>
                  )}
                  <div className="playlist-card-meta">
                    <span className="playlist-card-creator">
                      <Users size={14} />
                      {playlist.creator_username || 'Utente'}
                    </span>
                    <span className="playlist-card-stats">
                      {playlist.track_count || 0} brani • {formatDuration(playlist.total_duration)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

