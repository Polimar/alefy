import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../utils/api';
import usePlayerStore from '../store/playerStore';
import { Play, Music, MoreVertical, Plus, Trash2, Scissors, Edit, Share2 } from 'lucide-react';
import EditTrackModal from '../components/EditTrackModal';
import './Library.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function Library() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [playlists, setPlaylists] = useState([]);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [selectedTracks, setSelectedTracks] = useState([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState(new Set());
  const [menuOpen, setMenuOpen] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitTrack, setSplitTrack] = useState(null);
  const [splitTimestamps, setSplitTimestamps] = useState([]);
  const [splitLoading, setSplitLoading] = useState(false);
  const [editingTrack, setEditingTrack] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreatePlaylistForm, setShowCreatePlaylistForm] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const { setCurrentTrack, setQueue, play } = usePlayerStore();
  const searchTimeoutRef = useRef(null);

  // Carica playlists solo al mount
  useEffect(() => {
    loadPlaylists();
    // Carica anche le tracce iniziali
    loadTracks();
  }, []);

  // Debounce per la ricerca - evita troppe richieste durante la digitazione
  useEffect(() => {
    // Quando la ricerca è vuota, ricarica tutte le tracce immediatamente
    if (search === '') {
      loadTracks();
      return;
    }
    
    // Cancella timeout precedente
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Imposta nuovo timeout per la ricerca con testo
    searchTimeoutRef.current = setTimeout(() => {
      loadTracks();
    }, 500); // Attendi 500ms dopo l'ultima digitazione
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search]);

  // Carica le cover solo quando cambiano le tracce (non ad ogni render)
  // Non riprova se una cover ha già fallito (404) per quella traccia specifica
  useEffect(() => {
    // Pulisci i fallimenti per tracce che non sono più nella lista corrente
    // (utile quando si fa una ricerca e poi si torna alla lista completa)
    const currentTrackIds = new Set(tracks.map(t => t.id));
    failedCoversRef.current.forEach(trackId => {
      if (!currentTrackIds.has(trackId)) {
        failedCoversRef.current.delete(trackId);
      }
    });
    
    // Carica solo le cover che non sono già caricate, non in caricamento, e non hanno fallito
    const tracksToLoad = tracks.filter(track => 
      track.cover_art_path && 
      !coverUrls[track.id] && 
      !loadingCoversRef.current.has(track.id) &&
      !failedCoversRef.current.has(track.id)
    );
    
    // Carica tutte le cover disponibili (una volta sola per ogni traccia)
    tracksToLoad.forEach(track => {
      getCoverArtUrl(track).catch(err => {
        // Gli errori sono già gestiti in getCoverArtUrl
        console.error('Error loading cover:', err);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]); // Solo quando cambiano le tracce, non ad ogni render

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
      const response = await api.get('/playlists', { params: { addable: true } });
      setPlaylists(response.data.data.playlists || []);
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
      // Su desktop, riproduci la traccia SINGOLA (non come playlist)
      // Non impostare la queue, così quando finisce non parte la prossima
      setCurrentTrack(track);
      play();
    }
  };

  const [coverUrls, setCoverUrls] = useState({});
  const loadingCoversRef = useRef(new Set()); // Traccia le cover in caricamento per evitare chiamate duplicate
  const failedCoversRef = useRef(new Set()); // Traccia le cover che hanno fallito (404) per non riprovarle

  const getCoverArtUrl = async (track) => {
    if (!track.cover_art_path) return null;
    if (coverUrls[track.id]) return coverUrls[track.id];
    
    // Non riprovare se ha già fallito (404)
    if (failedCoversRef.current.has(track.id)) {
      return null;
    }
    
    // Evita chiamate duplicate se già in caricamento
    if (loadingCoversRef.current.has(track.id)) {
      return null;
    }

    loadingCoversRef.current.add(track.id);

    try {
      // Usa api (axios) invece di fetch per beneficiare dell'interceptor che gestisce il refresh token
      const response = await api.get(`/stream/tracks/${track.id}/cover`, {
        responseType: 'blob',
      });

      if (response.status === 200) {
        const blob = response.data;
        const blobUrl = URL.createObjectURL(blob);
        setCoverUrls(prev => ({ ...prev, [track.id]: blobUrl }));
        return blobUrl;
      }
    } catch (error) {
      // Se è un 404, traccia come fallimento permanente
      if (error.response?.status === 404) {
        failedCoversRef.current.add(track.id);
      } else {
        // Per altri errori (401, 500, ecc.), non tracciare come fallimento permanente
        // Potrebbe essere un problema temporaneo (token scaduto, rete, ecc.)
        console.error('Error loading cover art:', error.response?.status || error.message);
      }
    } finally {
      loadingCoversRef.current.delete(track.id);
    }
    return null;
  };

  const openAddToPlaylistModal = (tracksToAdd) => {
    setSelectedTracks(tracksToAdd);
    setShowAddToPlaylist(true);
    setShowCreatePlaylistForm(false);
    setNewPlaylistName('');
    setMenuOpen(null);
    setMenuAnchor(null);
  };

  const handleAddToPlaylist = (track) => openAddToPlaylistModal([track]);

  const handleAddSelectedToPlaylist = () => {
    const toAdd = tracks.filter(t => selectedTrackIds.has(t.id));
    if (toAdd.length === 0) return;
    openAddToPlaylistModal(toAdd);
  };

  const toggleTrackSelection = (trackId, e) => {
    e.stopPropagation();
    setSelectedTrackIds(prev => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedTrackIds.size === tracks.length) {
      setSelectedTrackIds(new Set());
    } else {
      setSelectedTrackIds(new Set(tracks.map(t => t.id)));
    }
  };

  const handleEditTrack = (track) => {
    setEditingTrack(track);
    setShowEditModal(true);
    setMenuOpen(null);
  };

  const handleTrackUpdated = (updatedTrack) => {
    // Ricarica le tracce per vedere le modifiche
    loadTracks();
  };

  const handleAddTrackToPlaylist = async (playlistId) => {
    if (!selectedTracks.length) return;

    try {
      for (const track of selectedTracks) {
        await api.post(`/playlists/${playlistId}/tracks`, {
          track_id: track.id,
        });
      }
      setShowAddToPlaylist(false);
      setSelectedTracks([]);
      setSelectedTrackIds(new Set());
      loadPlaylists();
      const n = selectedTracks.length;
      alert(n === 1 ? 'Traccia aggiunta alla playlist!' : `${n} tracce aggiunte alla playlist!`);
    } catch (error) {
      console.error('Error adding track to playlist:', error);
      const errorMessage = error.response?.data?.message || error.response?.data?.error?.message || 'Errore nell\'aggiunta della traccia alla playlist';
      alert(errorMessage);
    }
  };

  const handleCreatePlaylistAndAdd = async (name) => {
    if (!name.trim() || !selectedTracks.length) return;
    try {
      const { data } = await api.post('/playlists', { name: name.trim() });
      const playlistId = data.data.playlist.id;
      await handleAddTrackToPlaylist(playlistId);
      loadPlaylists();
    } catch (error) {
      console.error('Error creating playlist:', error);
      alert(error?.response?.data?.message || 'Errore nella creazione della playlist');
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

  const handleDeleteSelectedTracks = async (e) => {
    e?.stopPropagation();
    if (selectedTrackIds.size === 0) return;
    if (!confirm(`Eliminare le ${selectedTrackIds.size} tracce selezionate? L'operazione non può essere annullata.`)) return;

    try {
      const ids = Array.from(selectedTrackIds);
      for (const id of ids) {
        await api.delete(`/tracks/${id}`);
      }
      setSelectedTrackIds(new Set());
      setMenuOpen(null);
      setMenuAnchor(null);
      loadTracks();
      alert(`${ids.length} tracce eliminate`);
    } catch (error) {
      console.error('Error deleting tracks:', error);
      alert('Errore nell\'eliminazione delle tracce');
    }
  };

  const handleSplitTrack = (track, e) => {
    e.stopPropagation();
    setSplitTrack(track);
    setSplitTimestamps([]);
    setShowSplitModal(true);
    setMenuOpen(null);
  };

  const handleShareWhatsApp = async (track, e) => {
    e.stopPropagation();
    setMenuOpen(null);
    
    try {
      const trackTitle = track.title || 'Titolo sconosciuto';
      const trackArtist = track.artist || 'Artista sconosciuto';
      
      // Genera token di condivisione
      const token = localStorage.getItem('accessToken');
      const shareResponse = await fetch(`${API_URL}/share/track/${track.id}`, {
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
      const shareText = `🎵 ${trackTitle} - ${trackArtist}\n\nAscolta qui: ${shareUrl}`;
      
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
    const btn = e.currentTarget;
    if (menuOpen === trackId) {
      setMenuOpen(null);
      setMenuAnchor(null);
    } else {
      const rect = btn.getBoundingClientRect();
      setMenuAnchor({ top: rect.bottom + 4, left: rect.right - 200, trackId });
      setMenuOpen(trackId);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuOpen && !e.target.closest('.track-actions') && !e.target.closest('.action-menu-portal')) {
        setMenuOpen(null);
        setMenuAnchor(null);
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

  const renderActionMenu = (track) => (
    <div
      className="action-menu action-menu-portal"
      style={
        menuAnchor
          ? {
              position: 'fixed',
              top: menuAnchor.top,
              left: menuAnchor.left,
              right: 'auto',
              marginTop: 0,
            }
          : undefined
      }
    >
      <button
        className="action-menu-item"
        onClick={() => handleAddToPlaylist(track)}
      >
        <Plus size={16} />
        Aggiungi a playlist
      </button>
      <button className="action-menu-item" onClick={() => handleEditTrack(track)}>
        <Edit size={16} />
        Modifica metadati
      </button>
      <button className="action-menu-item" onClick={(e) => handleShareWhatsApp(track, e)}>
        <Share2 size={16} />
        Condividi su WhatsApp
      </button>
      {track.duration > 1800 && (
        <button className="action-menu-item" onClick={(e) => handleSplitTrack(track, e)}>
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
      {selectedTrackIds.size > 0 && (
        <button
          className="action-menu-item danger"
          onClick={(e) => handleDeleteSelectedTracks(e)}
        >
          <Trash2 size={16} />
          Elimina le tracce selezionate
        </button>
      )}
    </div>
  );

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
          {selectedTrackIds.size > 0 && (
            <div className="bulk-actions-bar">
              <span className="bulk-actions-count">
                {selectedTrackIds.size} tracce selezionate
              </span>
              <button
                className="btn-bulk-add"
                onClick={handleAddSelectedToPlaylist}
              >
                <Plus size={18} />
                Aggiungi a playlist
              </button>
              <button
                className="btn-bulk-clear"
                onClick={() => setSelectedTrackIds(new Set())}
              >
                Deseleziona
              </button>
            </div>
          )}
          {/* Desktop: Tabella */}
          <div className="tracks-container">
            <table className="tracks-table">
              <thead>
                <tr>
                  <th className="track-checkbox-th">
                    <input
                      type="checkbox"
                      checked={selectedTrackIds.size === tracks.length && tracks.length > 0}
                      onChange={toggleSelectAll}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Seleziona tutte"
                    />
                  </th>
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
                  return (
                    <tr
                      key={track.id}
                      className="track-row"
                      onClick={(e) => handleTrackClick(track, e)}
                    >
                      <td className="track-checkbox-cell" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedTrackIds.has(track.id)}
                          onChange={(e) => toggleTrackSelection(track.id, e)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Seleziona ${track.title}`}
                        />
                      </td>
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
                          {menuOpen === track.id && menuAnchor?.trackId === track.id && typeof window !== 'undefined' && window.innerWidth >= 769 &&
                            createPortal(renderActionMenu(track), document.body)}
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
              return (
                <div
                  key={track.id}
                  className="track-card"
                  onClick={(e) => handleTrackClick(track, e)}
                >
                  <div className="track-card-checkbox" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedTrackIds.has(track.id)}
                      onChange={(e) => toggleTrackSelection(track.id, e)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Seleziona ${track.title}`}
                    />
                  </div>
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
                  <div className="track-card-actions">
                    <button
                      className="action-btn"
                      onClick={(e) => handleMenuClick(track.id, e)}
                    >
                      <MoreVertical size={18} />
                    </button>
                    {menuOpen === track.id && (
                      <div className="action-menu action-menu-mobile" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="action-menu-item"
                          onClick={() => handleAddToPlaylist(track)}
                        >
                          <Plus size={16} />
                          Aggiungi a playlist
                        </button>
                        <button
                          className="action-menu-item"
                          onClick={() => handleEditTrack(track)}
                        >
                          <Edit size={16} />
                          Modifica metadati
                        </button>
                        <button
                          className="action-menu-item"
                          onClick={(e) => handleShareWhatsApp(track, e)}
                        >
                          <Share2 size={16} />
                          Condividi su WhatsApp
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
                        {selectedTrackIds.size > 0 && (
                          <button
                            className="action-menu-item danger"
                            onClick={(e) => handleDeleteSelectedTracks(e)}
                          >
                            <Trash2 size={16} />
                            Elimina le tracce selezionate
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showAddToPlaylist && selectedTracks.length > 0 && (
        <div className="modal-overlay" onClick={() => {
          setShowAddToPlaylist(false);
          setSelectedTracks([]);
          setShowCreatePlaylistForm(false);
          setNewPlaylistName('');
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Aggiungi a Playlist</h2>
            <p className="modal-subtitle">
              {selectedTracks.length === 1
                ? `Seleziona una playlist per "${selectedTracks[0].title}"`
                : `Le ${selectedTracks.length} tracce selezionate verranno aggiunte alla playlist`}
            </p>
            {showCreatePlaylistForm ? (
              <div className="create-playlist-inline">
                <input
                  type="text"
                  placeholder="Nome nuova playlist"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  className="create-playlist-input"
                  autoFocus
                />
                <div className="create-playlist-actions">
                  <button
                    className="btn-cancel"
                    onClick={() => {
                      setShowCreatePlaylistForm(false);
                      setNewPlaylistName('');
                    }}
                  >
                    Annulla
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => handleCreatePlaylistAndAdd(newPlaylistName)}
                    disabled={!newPlaylistName.trim()}
                  >
                    Crea e aggiungi
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  className="btn-create-playlist-top"
                  onClick={() => setShowCreatePlaylistForm(true)}
                >
                  <Plus size={18} />
                  Crea nuova playlist
                </button>
                {playlists.length === 0 ? (
                  <div className="no-playlists">
                    <p>Nessuna playlist esistente. Crea la prima qui sopra.</p>
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
                          <div className="playlist-select-name">
                            {playlist.name}
                            {playlist.is_shared && (
                              <span className="playlist-shared-badge">Condivisa</span>
                            )}
                          </div>
                          <div className="playlist-select-count">
                            {playlist.track_count || 0} brani
                            {playlist.is_shared && playlist.creator_username && (
                              <> • {playlist.creator_username}</>
                            )}
                          </div>
                        </div>
                        <Plus size={20} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {!showCreatePlaylistForm && (
              <div className="modal-actions">
                <button
                  className="btn-cancel"
                  onClick={() => {
                    setShowAddToPlaylist(false);
                    setSelectedTracks([]);
                  }}
                >
                  Annulla
                </button>
              </div>
            )}
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

      {/* Edit Track Modal */}
      <EditTrackModal
        track={editingTrack}
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingTrack(null);
        }}
        onUpdate={handleTrackUpdated}
      />
    </div>
  );
}

