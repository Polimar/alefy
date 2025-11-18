import { useState, useEffect } from 'react';
import api from '../utils/api';
import './Playlists.css';

export default function Playlists() {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="playlists">
      <div className="playlists-header">
        <h1>Playlist</h1>
      </div>
      {loading ? (
        <div className="loading">Caricamento...</div>
      ) : playlists.length === 0 ? (
        <div className="empty-state">Nessuna playlist</div>
      ) : (
        <div className="playlists-grid">
          {playlists.map((playlist) => (
            <div key={playlist.id} className="playlist-card">
              <div className="playlist-name">{playlist.name}</div>
              <div className="playlist-info">
                {playlist.track_count} brani
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

