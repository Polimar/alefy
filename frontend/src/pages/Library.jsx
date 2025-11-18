import { useState, useEffect } from 'react';
import api from '../utils/api';
import usePlayerStore from '../store/playerStore';
import './Library.css';

export default function Library() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { setCurrentTrack, setQueue, play } = usePlayerStore();

  useEffect(() => {
    loadTracks();
  }, [search]);

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
        <div className="empty-state">Nessun brano trovato</div>
      ) : (
        <div className="tracks-list">
          {tracks.map((track) => (
            <div
              key={track.id}
              className="track-item"
              onClick={() => {
                setQueue(tracks);
                setCurrentTrack(track);
                play();
              }}
            >
              <div className="track-info">
                <div className="track-title">{track.title}</div>
                <div className="track-artist">{track.artist}</div>
              </div>
              <div className="track-duration">
                {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

