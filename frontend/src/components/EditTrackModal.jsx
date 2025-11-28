import { useState, useEffect } from 'react';
import { X, Upload, Music, Loader2 } from 'lucide-react';
import api from '../utils/api';
import './EditTrackModal.css';

export default function EditTrackModal({ track, isOpen, onClose, onUpdate }) {
  const [formData, setFormData] = useState({
    title: '',
    artist: '',
    album: '',
    genre: '',
    year: '',
  });
  const [coverPreview, setCoverPreview] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (track && isOpen) {
      setFormData({
        title: track.title || '',
        artist: track.artist || '',
        album: track.album || '',
        genre: track.genre || '',
        year: track.year || '',
      });
      setCoverPreview(null);
      setCoverFile(null);
      setError('');
    }
  }, [track, isOpen]);

  // Carica preview cover art esistente
  useEffect(() => {
    if (track?.cover_art_path && track?.id && isOpen && !coverPreview && !coverFile) {
      const loadCoverPreview = async () => {
        try {
          const token = localStorage.getItem('accessToken');
          const API_URL = import.meta.env.VITE_API_URL || '/api';
          const response = await fetch(`${API_URL}/stream/tracks/${track.id}/cover`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          if (response.ok) {
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            setCoverPreview(blobUrl);
          }
        } catch (err) {
          console.error('Error loading cover preview:', err);
        }
      };
      loadCoverPreview();
    }

    return () => {
      if (coverPreview && coverPreview.startsWith('blob:')) {
        URL.revokeObjectURL(coverPreview);
      }
    };
  }, [track, isOpen, coverPreview, coverFile]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCoverChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Revoca vecchia preview se esiste
      if (coverPreview && coverPreview.startsWith('blob:')) {
        URL.revokeObjectURL(coverPreview);
      }
      setCoverFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setCoverPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRecognize = async () => {
    if (!track) return;
    setRecognizing(true);
    setError('');
    try {
      const response = await api.post(`/metadata/process/${track.id}`);
      if (response.data.success) {
        // Ricarica i dati della traccia
        const trackResponse = await api.get(`/tracks/${track.id}`);
        const updatedTrack = trackResponse.data.data.track;
        setFormData({
          title: updatedTrack.title || '',
          artist: updatedTrack.artist || '',
          album: updatedTrack.album || '',
          genre: updatedTrack.genre || '',
          year: updatedTrack.year || '',
        });
        alert('Metadati riconosciuti con successo!');
      }
    } catch (err) {
      console.error('Error recognizing track:', err);
      setError('Errore nel riconoscimento automatico dei metadati');
    } finally {
      setRecognizing(false);
    }
  };

  const handleShazamRecognize = async () => {
    if (!track) return;
    setRecognizing(true);
    setError('');
    try {
      const response = await api.post(`/metadata/shazam/${track.id}`);
      if (response.data.success && response.data.data.metadata) {
        const metadata = response.data.data.metadata;
        setFormData({
          title: metadata.title || formData.title,
          artist: metadata.artist || formData.artist,
          album: metadata.album || formData.album,
          genre: metadata.genre || formData.genre,
          year: metadata.year || formData.year,
        });
        alert('Riconoscimento Shazam completato!');
      }
    } catch (err) {
      console.error('Error recognizing with Shazam:', err);
      const errorMessage = err.response?.data?.error?.message || 'Errore nel riconoscimento Shazam';
      setError(errorMessage);
    } finally {
      setRecognizing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!track) return;

    setLoading(true);
    setError('');

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('title', formData.title);
      formDataToSend.append('artist', formData.artist);
      formDataToSend.append('album', formData.album);
      if (formData.genre) formDataToSend.append('genre', formData.genre);
      if (formData.year) formDataToSend.append('year', formData.year);
      if (coverFile) {
        formDataToSend.append('cover_art', coverFile);
      }

      const response = await api.put(`/tracks/${track.id}`, formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        onUpdate?.(response.data.data.track);
        onClose();
      }
    } catch (err) {
      console.error('Error updating track:', err);
      const errorMessage = err.response?.data?.message || err.response?.data?.error?.message || 'Errore nell\'aggiornamento della traccia';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !track) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="edit-track-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Modifica Metadati</h2>
          <button onClick={onClose} className="modal-close-btn">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="edit-track-form">
          {error && (
            <div className="form-error">
              {error}
            </div>
          )}

          {/* Cover Art Preview */}
          <div className="form-group cover-art-group">
            <label>Cover Art</label>
            <div className="cover-art-preview-container">
              {coverPreview ? (
                <img src={coverPreview} alt="Cover preview" className="cover-art-preview" />
              ) : (
                <div className="cover-art-placeholder">
                  <Music size={48} />
                </div>
              )}
              <label className="cover-art-upload-btn">
                <Upload size={18} />
                {coverFile ? 'Cambia immagine' : 'Carica immagine'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverChange}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          {/* Form Fields */}
          <div className="form-group">
            <label htmlFor="title">Titolo *</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              required
              placeholder="Titolo del brano"
            />
          </div>

          <div className="form-group">
            <label htmlFor="artist">Artista *</label>
            <input
              type="text"
              id="artist"
              name="artist"
              value={formData.artist}
              onChange={handleInputChange}
              required
              placeholder="Nome artista"
            />
          </div>

          <div className="form-group">
            <label htmlFor="album">Album</label>
            <input
              type="text"
              id="album"
              name="album"
              value={formData.album}
              onChange={handleInputChange}
              placeholder="Nome album"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="genre">Genere</label>
              <input
                type="text"
                id="genre"
                name="genre"
                value={formData.genre}
                onChange={handleInputChange}
                placeholder="Genere musicale"
              />
            </div>

            <div className="form-group">
              <label htmlFor="year">Anno</label>
              <input
                type="number"
                id="year"
                name="year"
                value={formData.year}
                onChange={handleInputChange}
                placeholder="Anno"
                min="1900"
                max="2100"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="form-actions">
            <div className="recognize-buttons">
              <button
                type="button"
                onClick={handleRecognize}
                className="btn-secondary"
                disabled={recognizing}
              >
                {recognizing ? (
                  <>
                    <Loader2 size={16} className="spinning" />
                    Riconoscimento...
                  </>
                ) : (
                  'Riconosci automaticamente'
                )}
              </button>
              <button
                type="button"
                onClick={handleShazamRecognize}
                className="btn-secondary"
                disabled={recognizing}
                title="Riconosci con Shazam"
              >
                {recognizing ? (
                  <>
                    <Loader2 size={16} className="spinning" />
                    Shazam...
                  </>
                ) : (
                  'Shazam'
                )}
              </button>
            </div>
            <div className="form-actions-right">
              <button type="button" onClick={onClose} className="btn-secondary">
                Annulla
              </button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 size={16} className="spinning" />
                    Salvataggio...
                  </>
                ) : (
                  'Salva'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

