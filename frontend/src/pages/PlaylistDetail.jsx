import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import usePlayerStore from '../store/playerStore';
import { Play, Trash2, ArrowLeft, Music, Shuffle, Repeat, Repeat1, Download, CheckCircle2, Loader, MoreVertical, Edit, Globe, Lock, Share2 } from 'lucide-react';
import EditPlaylistModal from '../components/EditPlaylistModal';
import { saveTrackOffline, isTrackOffline, removeTrackOffline, getOfflineTracksForPlaylist } from '../utils/offlineStorage';
import useAuthStore from '../store/authStore';
import './PlaylistDetail.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function PlaylistDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [coverUrl, setCoverUrl] = useState(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [selectedTracks, setSelectedTracks] = useState(new Set());
  const [downloadingTracks, setDownloadingTracks] = useState(new Set());
  const [offlineTracks, setOfflineTracks] = useState(new Set());
  const [showEditModal, setShowEditModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuthStore();
  const { 
    setCurrentTrack, 
    setQueue, 
    play,
    shuffle,
    repeat,
    toggleShuffle,
    setRepeat
  } = usePlayerStore();
  
  const isOwner = playlist && user && playlist.user_id === user.id;

  useEffect(() => {
    loadPlaylist();
  }, [id]);

  // Carica tracce offline quando cambia la playlist
  useEffect(() => {
    const loadOfflineTracks = async () => {
      if (!id) return;
      try {
        const offlineTracksList = await getOfflineTracksForPlaylist(parseInt(id));
        const offlineIds = new Set(offlineTracksList.map(t => t.trackId));
        setOfflineTracks(offlineIds);
      } catch (error) {
        console.error('Error loading offline tracks:', error);
      }
    };
    loadOfflineTracks();
  }, [id, tracks]);

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

  const handleEditPlaylist = () => {
    setShowEditModal(true);
    setMenuOpen(false);
  };

  const handleDeletePlaylist = async () => {
    if (!confirm('Eliminare questa playlist? L\'operazione non può essere annullata.')) return;

    try {
      await api.delete(`/playlists/${id}`);
      navigate('/playlists');
    } catch (error) {
      console.error('Error deleting playlist:', error);
      alert('Errore nell\'eliminazione della playlist');
    }
  };

  const handleShareWhatsApp = async (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    
    if (!playlist) return;
    
    try {
      const playlistName = playlist.name || 'Playlist senza nome';
      
      // Genera token di condivisione
      const token = localStorage.getItem('accessToken');
      const shareResponse = await fetch(`${API_URL}/share/playlist/${id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!shareResponse.ok) {
        throw new Error('Errore nella generazione del link di condivisione');
      }
      
      const shareData = await shareResponse.json();
      const shareUrl = shareData.data.shareUrl;
      
      // Crea messaggio WhatsApp con link
      const shareText = `🎵 ${playlistName}\n\nAscolta la playlist qui: ${shareUrl}`;
      
      // Su mobile, prova ad aprire WhatsApp nativo
      if (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(shareText)}`;
        window.location.href = whatsappUrl;
      } else {
        // Su desktop, apri WhatsApp Web
        const whatsappUrl = `https://web.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
        window.open(whatsappUrl, '_blank');
      }
    } catch (error) {
      console.error('Errore condivisione WhatsApp:', error);
      alert('Errore nella condivisione. Riprova.');
    }
  };

  const handlePlaylistUpdated = (updatedPlaylist) => {
    setPlaylist(updatedPlaylist);
    loadPlaylist();
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

  const toggleTrackSelection = (trackId) => {
    setSelectedTracks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(trackId)) {
        newSet.delete(trackId);
      } else {
        newSet.add(trackId);
      }
      return newSet;
    });
  };

  const selectAllTracks = () => {
    setSelectedTracks(new Set(tracks.map(t => t.id)));
  };

  const deselectAllTracks = () => {
    setSelectedTracks(new Set());
  };

  const downloadSelectedTracks = async () => {
    if (selectedTracks.size === 0) return;

    const tracksToDownload = tracks.filter(t => selectedTracks.has(t.id));
    setDownloadingTracks(new Set(tracksToDownload.map(t => t.id)));

    try {
      for (const track of tracksToDownload) {
        try {
          const token = localStorage.getItem('accessToken');
          const streamUrl = `${API_URL}/stream/tracks/${track.id}`;
          
          const response = await fetch(streamUrl, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            throw new Error(`Errore ${response.status}`);
          }

          const audioBlob = await response.blob();
          await saveTrackOffline(track.id, audioBlob, track, parseInt(id));
          
          setOfflineTracks(prev => new Set(prev).add(track.id));
        } catch (error) {
          console.error(`Error downloading track ${track.id}:`, error);
          alert(`Errore nel download di "${track.title}"`);
        }
      }

      setSelectedTracks(new Set());
      alert(`${tracksToDownload.length} traccia/e scaricate offline con successo!`);
    } catch (error) {
      console.error('Error downloading tracks:', error);
      alert('Errore nel download delle tracce');
    } finally {
      setDownloadingTracks(new Set());
    }
  };

  const removeOfflineTrack = async (trackId) => {
    try {
      await removeTrackOffline(trackId);
      setOfflineTracks(prev => {
        const newSet = new Set(prev);
        newSet.delete(trackId);
        return newSet;
      });
    } catch (error) {
      console.error('Error removing offline track:', error);
      alert('Errore nella rimozione della traccia offline');
    }
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
          <div className="playlist-header-top">
            <div>
              <div className="playlist-type">
                Playlist
                {playlist.is_public && (
                  <span className="public-badge" title="Pubblica">
                    <Globe size={14} />
                  </span>
                )}
              </div>
              <h1>{playlist.name}</h1>
            </div>
            {isOwner && (
              <div className="playlist-menu-container">
                <button
                  className="playlist-menu-btn"
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  <MoreVertical size={20} />
                </button>
                {menuOpen && (
                  <div className="playlist-menu" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="playlist-menu-item"
                      onClick={handleEditPlaylist}
                    >
                      <Edit size={16} />
                      Modifica playlist
                    </button>
                    <button
                      className="playlist-menu-item danger"
                      onClick={handleDeletePlaylist}
                    >
                      <Trash2 size={16} />
                      Elimina playlist
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
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
            <button 
              className={`control-btn ${offlineMode ? 'active' : ''}`}
              onClick={() => setOfflineMode(!offlineMode)}
              title="Modalità offline"
            >
              <Download size={18} />
            </button>
          </div>
          {offlineMode && (
            <div className="offline-controls">
              <div className="offline-selection-controls">
                <button onClick={selectAllTracks} className="offline-btn-small">
                  Seleziona tutte
                </button>
                <button onClick={deselectAllTracks} className="offline-btn-small">
                  Deseleziona tutte
                </button>
                <span className="offline-selected-count">
                  {selectedTracks.size} selezionate
                </span>
              </div>
              <button 
                onClick={downloadSelectedTracks}
                disabled={selectedTracks.size === 0 || downloadingTracks.size > 0}
                className="offline-download-btn"
              >
                {downloadingTracks.size > 0 ? (
                  <>
                    <Loader size={16} className="spinning" />
                    Download in corso...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Scarica offline ({selectedTracks.size})
                  </>
                )}
              </button>
            </div>
          )}
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
                  {offlineMode && <th></th>}
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
                    {offlineMode && (
                      <td className="track-offline-checkbox">
                        <label className="offline-checkbox-label">
                          <input
                            type="checkbox"
                            checked={selectedTracks.has(track.id)}
                            onChange={() => toggleTrackSelection(track.id)}
                            disabled={downloadingTracks.has(track.id)}
                          />
                          {offlineTracks.has(track.id) && (
                            <CheckCircle2 size={16} className="offline-indicator" title="Disponibile offline" />
                          )}
                        </label>
                      </td>
                    )}
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
                      {offlineMode && offlineTracks.has(track.id) && (
                        <button
                          className="action-btn"
                          onClick={() => removeOfflineTrack(track.id)}
                          title="Rimuovi offline"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      {!offlineMode && (
                        <button
                          className="action-btn"
                          onClick={() => handleRemoveTrack(track.id)}
                          title="Rimuovi"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile: Cards */}
            <div className="tracks-table-mobile">
              {tracks.map((track, index) => (
                <div key={track.id} className="track-card">
                  {offlineMode && (
                    <div className="track-card-offline-checkbox">
                      <label className="offline-checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedTracks.has(track.id)}
                          onChange={() => toggleTrackSelection(track.id)}
                          disabled={downloadingTracks.has(track.id)}
                        />
                        {offlineTracks.has(track.id) && (
                          <CheckCircle2 size={16} className="offline-indicator" title="Disponibile offline" />
                        )}
                      </label>
                    </div>
                  )}
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
                    {offlineMode && offlineTracks.has(track.id) && (
                      <button
                        className="action-btn"
                        onClick={() => removeOfflineTrack(track.id)}
                        title="Rimuovi offline"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                    {!offlineMode && (
                      <button
                        className="action-btn"
                        onClick={() => handleRemoveTrack(track.id)}
                        title="Rimuovi"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Edit Playlist Modal */}
      {isOwner && (
        <EditPlaylistModal
          playlist={playlist}
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
          }}
          onUpdate={handlePlaylistUpdated}
        />
      )}
    </div>
  );
}

