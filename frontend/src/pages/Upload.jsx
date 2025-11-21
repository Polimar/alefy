import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { Download, Music, Search, X, CheckCircle, XCircle, Clock, Loader, Pause, Play, Trash2 } from 'lucide-react';
import './Upload.css';

export default function Upload() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({});
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeError, setYoutubeError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLimit, setSearchLimit] = useState('10');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const pollingIntervalRef = useRef(null);
  const [playlists, setPlaylists] = useState([]);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  const [playlistOption, setPlaylistOption] = useState('none'); // 'none', 'existing', 'new'
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [expandedTracks, setExpandedTracks] = useState({}); // Map<resultId, boolean>
  const [selectedTracks, setSelectedTracks] = useState({}); // Map<resultId, Set<trackIndex>>

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles([...files, ...selectedFiles]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles([...files, ...droppedFiles]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    try {
      await api.post('/upload/tracks', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setProgress({ overall: percentCompleted });
        },
      });
      setFiles([]);
      setProgress({});
      alert('Upload completato!');
    } catch (error) {
      console.error('Upload error:', error);
      alert('Errore durante l\'upload');
    } finally {
      setUploading(false);
    }
  };

  const handleYouTubeDownload = async (e) => {
    e.preventDefault();
    if (!youtubeUrl.trim()) return;

    try {
      setYoutubeError(null);
      
      await api.post('/youtube/download', {
        url: youtubeUrl.trim(),
      });

      setYoutubeUrl('');
      
      // Avvia il polling se non è già attivo (ogni 5 secondi)
      if (!pollingIntervalRef.current) {
        const fetchQueue = async () => {
          try {
            const response = await api.get('/youtube/queue');
            const jobs = response.data.data.jobs || [];
            setQueue(jobs);

            const hasActiveJobs = jobs.some(job => 
              job.status === 'pending' || 
              job.status === 'downloading' || 
              job.status === 'paused'
            );
            if (!hasActiveJobs && pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          } catch (error) {
            console.error('Errore nel recupero della coda:', error);
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          }
        };
        pollingIntervalRef.current = setInterval(fetchQueue, 5000);
      }
    } catch (error) {
      console.error('YouTube download error:', error);
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Errore durante il download';
      setYoutubeError(errorMessage);
    }
  };

  const isValidYouTubeUrl = (url) => {
    const patterns = [
      /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/,
      /^https?:\/\/(www\.)?youtube\.com\/watch\?v=.+/,
      /^https?:\/\/youtu\.be\/.+/,
    ];
    return patterns.some(pattern => pattern.test(url));
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Polling per aggiornare lo stato della coda (solo quando ci sono job attivi)
  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const response = await api.get('/youtube/queue');
        const jobs = response.data.data.jobs || [];
        setQueue(jobs);

        // Continua il polling solo se ci sono job attivi (pending, downloading, o paused)
        const hasActiveJobs = jobs.some(job => 
          job.status === 'pending' || 
          job.status === 'downloading' || 
          job.status === 'paused'
        );
        
        if (!hasActiveJobs && pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        } else if (hasActiveJobs && !pollingIntervalRef.current) {
          // Se ci sono job attivi ma il polling non è attivo, avvialo
          pollingIntervalRef.current = setInterval(fetchQueue, 5000);
        }
      } catch (error) {
        console.error('Errore nel recupero della coda:', error);
        // In caso di errore 429 o altri errori, ferma il polling per evitare richieste continue
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    };

    // Fetch iniziale una sola volta
    fetchQueue();

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  const cancelJob = async (jobId) => {
    try {
      await api.delete(`/youtube/queue/${jobId}`);
      // Rimuovi il job dalla coda locale invece di fare una nuova chiamata
      setQueue(prev => prev.filter(job => job.id !== jobId));
    } catch (error) {
      console.error('Errore nella cancellazione del job:', error);
      alert('Errore durante la cancellazione del job');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="status-icon completed" />;
      case 'failed':
        return <XCircle size={16} className="status-icon failed" />;
      case 'downloading':
        return <Loader size={16} className="status-icon downloading spinning" />;
      case 'pending':
        return <Clock size={16} className="status-icon pending" />;
      case 'paused':
        return <Pause size={16} className="status-icon paused" />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'completed':
        return 'Completato';
      case 'failed':
        return 'Errore';
      case 'downloading':
        return 'Download in corso';
      case 'pending':
        return 'In attesa';
      case 'paused':
        return 'In pausa';
      default:
        return status;
    }
  };

  const pauseJob = async (jobId) => {
    try {
      await api.post(`/youtube/queue/${jobId}/pause`);
      // Aggiorna lo stato localmente invece di fare una nuova chiamata
      setQueue(prev => prev.map(job => 
        job.id === jobId ? { ...job, status: 'paused' } : job
      ));
    } catch (error) {
      console.error('Errore nella pausa del job:', error);
      alert('Errore durante la pausa del job');
    }
  };

  const resumeJob = async (jobId) => {
    try {
      await api.post(`/youtube/queue/${jobId}/resume`);
      // Aggiorna lo stato localmente e riavvia il polling se necessario
      setQueue(prev => prev.map(job => 
        job.id === jobId ? { ...job, status: 'pending' } : job
      ));
      // Riavvia il polling se non è già attivo
      startPolling();
    } catch (error) {
      console.error('Errore nella ripresa del job:', error);
      alert('Errore durante la ripresa del job');
    }
  };

  // Carica playlists al mount
  useEffect(() => {
    const loadPlaylists = async () => {
      try {
        const response = await api.get('/playlists');
        setPlaylists(response.data.data.playlists || []);
      } catch (error) {
        console.error('Error loading playlists:', error);
      }
    };
    loadPlaylists();
  }, []);

  // Inizializza tracce selezionate quando vengono caricati i risultati
  useEffect(() => {
    searchResults.forEach(result => {
      if (result.isAlbum && result.timestamps && result.timestamps.length > 0) {
        if (!selectedTracks[result.id]) {
          // Tutte le tracce selezionate di default
          setSelectedTracks(prev => ({
            ...prev,
            [result.id]: new Set(result.timestamps.map((_, idx) => idx))
          }));
        }
      }
    });
  }, [searchResults]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setExpandedTracks({});
    setSelectedTracks({});

    try {
      const response = await api.get('/youtube/search', {
        params: {
          q: searchQuery.trim(),
          limit: searchLimit,
        },
      });

      const results = response.data.data.results || [];
      setSearchResults(results);
      
      // Inizializza tutte le tracce come selezionate per ogni album
      const initialSelected = {};
      results.forEach(result => {
        if (result.isAlbum && result.timestamps && result.timestamps.length > 0) {
          initialSelected[result.id] = new Set(result.timestamps.map((_, idx) => idx));
        }
      });
      setSelectedTracks(initialSelected);
    } catch (error) {
      console.error('YouTube search error:', error);
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Errore durante la ricerca';
      setSearchError(errorMessage);
    } finally {
      setSearching(false);
    }
  };

  const toggleTrackExpansion = (resultId) => {
    setExpandedTracks(prev => ({
      ...prev,
      [resultId]: !prev[resultId]
    }));
  };

  const toggleTrackSelection = (resultId, trackIndex) => {
    setSelectedTracks(prev => {
      const current = prev[resultId] || new Set();
      const updated = new Set(current);
      if (updated.has(trackIndex)) {
        updated.delete(trackIndex);
      } else {
        updated.add(trackIndex);
      }
      return {
        ...prev,
        [resultId]: updated
      };
    });
  };

  const startPolling = () => {
    if (!pollingIntervalRef.current) {
      const fetchQueue = async () => {
        try {
          const response = await api.get('/youtube/queue');
          const jobs = response.data.data.jobs || [];
          setQueue(jobs);

          const hasActiveJobs = jobs.some(job => 
            job.status === 'pending' || 
            job.status === 'downloading' || 
            job.status === 'paused'
          );
          if (!hasActiveJobs && pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        } catch (error) {
          console.error('Errore nel recupero della coda:', error);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      };
      pollingIntervalRef.current = setInterval(fetchQueue, 5000);
    }
  };

  const handleDownloadFromSearch = async (result) => {
    try {
      setYoutubeError(null);
      
      // Se è un album, mostra modal per playlist e tracce
      if (result.isAlbum && result.timestamps && result.timestamps.length > 0) {
        setSelectedResult(result);
        setShowPlaylistModal(true);
        
        // Suggerisci nome playlist dal canale/artista se disponibile
        const suggestedName = result.channel || result.title.split(' - ')[0] || '';
        setNewPlaylistName(suggestedName);
        return;
      }
      
      // Download normale per non-album
      await api.post('/youtube/download', {
        url: result.url,
        thumbnailUrl: result.thumbnail_url || null,
      });
      
      startPolling();
    } catch (error) {
      console.error('YouTube download error:', error);
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Errore durante il download';
      setYoutubeError(errorMessage);
    }
  };

  const handleConfirmDownload = async () => {
    if (!selectedResult) return;
    
    // Ottieni tracce selezionate
    const selectedIndices = selectedTracks[selectedResult.id] || new Set();
    const tracksToDownload = selectedResult.timestamps.filter((_, idx) => selectedIndices.has(idx));
    
    if (tracksToDownload.length === 0) {
      alert('Seleziona almeno una traccia da scaricare');
      return;
    }
    
    try {
      setYoutubeError(null);
      
      const downloadData = {
        url: selectedResult.url,
        thumbnailUrl: selectedResult.thumbnail_url || null,
        selectedTracks: tracksToDownload.length < selectedResult.timestamps.length ? tracksToDownload : null,
      };
      
      // Aggiungi playlist se specificata
      if (playlistOption === 'existing' && selectedPlaylistId) {
        downloadData.playlistId = selectedPlaylistId;
      } else if (playlistOption === 'new' && newPlaylistName.trim()) {
        downloadData.playlistName = newPlaylistName.trim();
      }
      
      await api.post('/youtube/download', downloadData);
      
      setShowPlaylistModal(false);
      setSelectedResult(null);
      setPlaylistOption('none');
      setSelectedPlaylistId(null);
      setNewPlaylistName('');
      
      startPolling();
    } catch (error) {
      console.error('YouTube download error:', error);
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Errore durante il download';
      setYoutubeError(errorMessage);
    }
  };

  return (
    <div className="upload">
      <h1>Carica Brani</h1>

      {/* YouTube Search Section */}
      <div className="youtube-search-section">
        <h2>
          <Search size={20} />
          Cerca su YouTube
        </h2>
        <form onSubmit={handleSearch} className="youtube-search-form">
          <div className="youtube-search-input-group">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchError(null);
              }}
              placeholder="Cerca brani, artisti, album..."
              className="youtube-search-input"
              disabled={searching}
            />
            <select
              value={searchLimit}
              onChange={(e) => setSearchLimit(e.target.value)}
              className="youtube-search-limit"
              disabled={searching}
            >
              <option value="5">5 risultati</option>
              <option value="10">10 risultati</option>
              <option value="20">20 risultati</option>
              <option value="50">50 risultati</option>
            </select>
            <button
              type="submit"
              disabled={searching || !searchQuery.trim()}
              className="youtube-search-btn"
            >
              {searching ? 'Cercando...' : 'Cerca'}
            </button>
          </div>
          {searchError && (
            <div className="youtube-search-error">
              {searchError}
            </div>
          )}
        </form>

        {searchResults.length > 0 && (
          <div className="youtube-search-results">
            <h3>Trovati {searchResults.length} risultati</h3>
            <div className="search-results-grid">
              {searchResults.map((result) => (
                <div key={result.id} className="search-result-card">
                  {result.thumbnail_url && (
                    <div className="result-thumbnail">
                      <img src={result.thumbnail_url} alt={result.title} />
                    </div>
                  )}
                  <div className="result-content">
                    <div className="result-title-row">
                      <h4 className="result-title">{result.title}</h4>
                      {result.isAlbum && (
                        <span className="album-badge" title="Album completo - verrà diviso automaticamente in tracce">
                          Album
                        </span>
                      )}
                    </div>
                    <p className="result-channel">{result.channel}</p>
                    <div className="result-meta">
                      <span className="result-duration">{formatDuration(result.duration)}</span>
                      {result.view_count > 0 && (
                        <span className="result-views">
                          {result.view_count.toLocaleString()} visualizzazioni
                        </span>
                      )}
                    </div>
                    {result.description && (
                      <p className="result-description">{result.description}</p>
                    )}
                    {result.isAlbum && result.timestamps && result.timestamps.length > 0 && (
                      <div className="result-timestamps">
                        <strong>
                          Tracce rilevate ({result.timestamps.length}):
                          {selectedTracks[result.id] && (
                            <span className="selected-count">
                              {' '}({selectedTracks[result.id].size} selezionate)
                            </span>
                          )}
                        </strong>
                        <ul className="timestamps-list">
                          {(expandedTracks[result.id] ? result.timestamps : result.timestamps.slice(0, 5)).map((ts, idx) => {
                            const isSelected = selectedTracks[result.id]?.has(idx) !== false; // Default true
                            return (
                              <li key={idx} className={isSelected ? 'track-selected' : ''}>
                                <label className="track-checkbox-label">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleTrackSelection(result.id, idx)}
                                    className="track-checkbox"
                                  />
                                  <span className="track-time">{formatDuration(ts.startTime)}</span>
                                  <span className="track-title">{ts.title}</span>
                                </label>
                              </li>
                            );
                          })}
                          {result.timestamps.length > 5 && !expandedTracks[result.id] && (
                            <li 
                              className="timestamps-more clickable"
                              onClick={() => toggleTrackExpansion(result.id)}
                            >
                              ... e altre {result.timestamps.length - 5} tracce (clicca per espandere)
                            </li>
                          )}
                          {expandedTracks[result.id] && result.timestamps.length > 5 && (
                            <li 
                              className="timestamps-more clickable"
                              onClick={() => toggleTrackExpansion(result.id)}
                            >
                              Nascondi tracce
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                    <button
                      onClick={() => handleDownloadFromSearch(result)}
                      disabled={queue.some(job => job.url === result.url && (job.status === 'pending' || job.status === 'downloading'))}
                      className="result-download-btn"
                    >
                      <Download size={16} />
                      {queue.some(job => job.url === result.url && (job.status === 'pending' || job.status === 'downloading')) 
                        ? 'In coda...' 
                        : result.isAlbum ? 'Scarica e dividi' : 'Scarica'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* YouTube Download Section */}
      <div className="youtube-section">
        <h2>
          <Download size={20} />
          Download da YouTube
        </h2>
        <form onSubmit={handleYouTubeDownload} className="youtube-form">
          <div className="youtube-input-group">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => {
                setYoutubeUrl(e.target.value);
                setYoutubeError(null);
              }}
              placeholder="Incolla qui l'URL del video YouTube..."
              className="youtube-input"
            />
            <button
              type="submit"
              disabled={!youtubeUrl.trim() || !isValidYouTubeUrl(youtubeUrl)}
              className="youtube-download-btn"
            >
              Aggiungi alla coda
            </button>
          </div>
          {!isValidYouTubeUrl(youtubeUrl) && youtubeUrl.trim() && (
            <div className="youtube-hint">
              Inserisci un URL YouTube valido (es: https://www.youtube.com/watch?v=...)
            </div>
          )}
          {youtubeError && (
            <div className="youtube-error">
              {youtubeError}
            </div>
          )}
        </form>
      </div>

      {/* Download Queue Section */}
      {queue.length > 0 && (
        <div className="download-queue-section">
          <h2>
            <Download size={20} />
            Coda Download ({queue.length})
          </h2>
          <div className="queue-list">
            {queue.map((job) => (
              <div key={job.id} className={`queue-item queue-item-${job.status}`}>
                <div className="queue-item-header">
                  <div className="queue-item-status">
                    {getStatusIcon(job.status)}
                    <span>{getStatusLabel(job.status)}</span>
                  </div>
                  <div className="queue-item-actions">
                    {job.status === 'pending' && (
                      <button
                        onClick={() => pauseJob(job.id)}
                        className="queue-action-btn queue-pause-btn"
                        title="Metti in pausa"
                      >
                        <Pause size={14} />
                      </button>
                    )}
                    {job.status === 'paused' && (
                      <>
                        <button
                          onClick={() => resumeJob(job.id)}
                          className="queue-action-btn queue-resume-btn"
                          title="Riprendi"
                        >
                          <Play size={14} />
                        </button>
                        <button
                          onClick={() => cancelJob(job.id)}
                          className="queue-action-btn queue-cancel-btn"
                          title="Elimina"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                    {(job.status === 'downloading' || job.status === 'failed') && (
                      <button
                        onClick={() => cancelJob(job.id)}
                        className="queue-action-btn queue-cancel-btn"
                        title="Elimina"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="queue-item-url">{job.url}</div>
                {(job.status === 'downloading' || job.status === 'paused') && (
                  <div className="queue-item-progress">
                    {job.statusMessage && (
                      <div className="progress-status-message">
                        {job.statusMessage}
                      </div>
                    )}
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${job.progress || 0}%` }}
                      />
                    </div>
                    <div className="progress-info">
                      <span>{Math.round(job.progress || 0)}%</span>
                      {job.speed && <span className="progress-speed">{job.speed}</span>}
                      {job.eta && <span className="progress-eta">ETA: {job.eta}</span>}
                    </div>
                  </div>
                )}
                {job.status === 'failed' && job.error && (
                  <div className="queue-item-error">{job.error}</div>
                )}
                {job.status === 'completed' && job.track && (
                  <div className="queue-item-success">
                    ✓ {job.track.title} - {job.track.artist}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File Upload Section */}
      <div className="upload-section">
        <h2>
          <Music size={20} />
          Carica File Audio
        </h2>
        <div
          className="upload-area"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <p>Trascina i file qui o clicca per selezionare</p>
          <input
            type="file"
            multiple
            accept="audio/*"
            onChange={handleFileSelect}
            className="file-input"
          />
        </div>
      </div>
      {files.length > 0 && (
        <div className="files-list">
          <h2>File selezionati ({files.length})</h2>
          {files.map((file, index) => (
            <div key={index} className="file-item">
              <span>{file.name}</span>
              <button onClick={() => removeFile(index)}>Rimuovi</button>
            </div>
          ))}
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="upload-btn"
          >
            {uploading ? 'Caricamento...' : 'Carica'}
          </button>
          {uploading && progress.overall && (
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress.overall}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Modal selezione playlist per album */}
      {showPlaylistModal && selectedResult && (
        <div className="modal-overlay" onClick={() => {
          setShowPlaylistModal(false);
          setSelectedResult(null);
          setPlaylistOption('none');
        }}>
          <div className="modal-content playlist-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Scarica Album</h2>
            <p className="modal-subtitle">
              "{selectedResult.title}"
            </p>
            <p className="modal-info">
              {selectedTracks[selectedResult.id]?.size || selectedResult.timestamps?.length || 0} tracce selezionate su {selectedResult.timestamps?.length || 0} totali
            </p>

            <div className="playlist-options">
              <label className="radio-option">
                <input
                  type="radio"
                  name="playlist-option"
                  value="none"
                  checked={playlistOption === 'none'}
                  onChange={(e) => setPlaylistOption(e.target.value)}
                />
                <span>Non aggiungere a playlist</span>
              </label>

              <label className="radio-option">
                <input
                  type="radio"
                  name="playlist-option"
                  value="existing"
                  checked={playlistOption === 'existing'}
                  onChange={(e) => setPlaylistOption(e.target.value)}
                />
                <span>Aggiungi a playlist esistente</span>
              </label>
              {playlistOption === 'existing' && (
                <select
                  value={selectedPlaylistId || ''}
                  onChange={(e) => setSelectedPlaylistId(e.target.value ? parseInt(e.target.value) : null)}
                  className="playlist-select"
                >
                  <option value="">Seleziona playlist...</option>
                  {playlists.map(playlist => (
                    <option key={playlist.id} value={playlist.id}>
                      {playlist.name} ({playlist.track_count || 0} brani)
                    </option>
                  ))}
                </select>
              )}

              <label className="radio-option">
                <input
                  type="radio"
                  name="playlist-option"
                  value="new"
                  checked={playlistOption === 'new'}
                  onChange={(e) => setPlaylistOption(e.target.value)}
                />
                <span>Crea nuova playlist</span>
              </label>
              {playlistOption === 'new' && (
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="Nome playlist..."
                  className="playlist-name-input"
                />
              )}
            </div>

            <div className="modal-actions">
              <button
                className="btn-cancel"
                onClick={() => {
                  setShowPlaylistModal(false);
                  setSelectedResult(null);
                  setPlaylistOption('none');
                }}
              >
                Annulla
              </button>
              <button
                className="btn-primary"
                onClick={handleConfirmDownload}
                disabled={
                  (playlistOption === 'existing' && !selectedPlaylistId) ||
                  (playlistOption === 'new' && !newPlaylistName.trim())
                }
              >
                Scarica
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

