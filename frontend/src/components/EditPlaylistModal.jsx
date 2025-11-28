import { useState, useEffect } from 'react';
import { X, Upload, Music, Loader2 } from 'lucide-react';
import api from '../utils/api';
import './EditPlaylistModal.css';

export default function EditPlaylistModal({ playlist, isOpen, onClose, onUpdate }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_public: false,
  });
  const [coverPreview, setCoverPreview] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (playlist && isOpen) {
      setFormData({
        name: playlist.name || '',
        description: playlist.description || '',
        is_public: playlist.is_public || false,
      });
      setCoverPreview(null);
      setCoverFile(null);
      setError('');
    }
  }, [playlist, isOpen]);

  // Carica preview cover art esistente
  useEffect(() => {
    if (playlist?.cover_art_path && playlist?.id && isOpen && !coverPreview && !coverFile) {
      const loadCoverPreview = async () => {
        try {
          const token = localStorage.getItem('accessToken');
          const API_URL = import.meta.env.VITE_API_URL || '/api';
          // Per le playlist, usa l'endpoint cover se disponibile, altrimenti usa la prima traccia
          if (playlist.first_track_id) {
            const response = await fetch(`${API_URL}/stream/tracks/${playlist.first_track_id}/cover`, {
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            });
            if (response.ok) {
              const blob = await response.blob();
              const blobUrl = URL.createObjectURL(blob);
              setCoverPreview(blobUrl);
            }
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
  }, [playlist, isOpen, coverPreview, coverFile]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!playlist) return;

    setLoading(true);
    setError('');

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      if (formData.description) formDataToSend.append('description', formData.description);
      formDataToSend.append('is_public', formData.is_public.toString());
      if (coverFile) {
        formDataToSend.append('cover_art', coverFile);
      }

      const response = await api.put(`/playlists/${playlist.id}`, formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        onUpdate?.(response.data.data.playlist);
        onClose();
      }
    } catch (err) {
      console.error('Error updating playlist:', err);
      const errorMessage = err.response?.data?.message || err.response?.data?.error?.message || 'Errore nell\'aggiornamento della playlist';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !playlist) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="edit-playlist-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Modifica Playlist</h2>
          <button onClick={onClose} className="modal-close-btn">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="edit-playlist-form">
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
            <label htmlFor="name">Nome *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              placeholder="Nome della playlist"
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Descrizione</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Descrizione della playlist"
              rows={4}
            />
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="is_public"
                checked={formData.is_public}
                onChange={handleInputChange}
              />
              <span>Rendi pubblica (visibile a tutti gli utenti)</span>
            </label>
          </div>

          {/* Actions */}
          <div className="form-actions">
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
        </form>
      </div>
    </div>
  );
}

