import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import api from '../utils/api';
import './EditUserModal.css';

export default function EditUserModal({ user, isOpen, onClose, onUpdate }) {
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    is_admin: false,
  });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user && isOpen) {
      setFormData({
        email: user.email || '',
        username: user.username || '',
        password: '',
        is_admin: user.is_admin || false,
      });
      setError('');
      loadUserStats();
    }
  }, [user, isOpen]);

  const loadUserStats = async () => {
    if (!user?.id) return;
    try {
      setLoadingStats(true);
      const response = await api.get(`/users/${user.id}`);
      if (response.data.success && response.data.data.user.stats) {
        setStats(response.data.data.user.stats);
      }
    } catch (error) {
      console.error('Error loading user stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      const payload = {
        email: formData.email,
        username: formData.username || null,
        is_admin: formData.is_admin,
      };

      // Only include password if it's been changed
      if (formData.password && formData.password.trim() !== '') {
        payload.password = formData.password;
      }

      const response = await api.patch(`/users/${user.id}`, payload);

      if (response.data.success) {
        onUpdate?.(response.data.data.user);
        onClose();
      }
    } catch (err) {
      console.error('Error updating user:', err);
      const errorMessage = err.response?.data?.message || err.response?.data?.error?.message || 'Errore nell\'aggiornamento dell\'utente';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !user) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="edit-user-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Modifica Utente</h2>
          <button onClick={onClose} className="modal-close-btn">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="edit-user-form">
          {error && (
            <div className="form-error">
              {error}
            </div>
          )}

          {/* Statistics */}
          {stats && (
            <div className="user-stats">
              <h3>Statistiche</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-label">Tracce</div>
                  <div className="stat-value">{stats.trackCount}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Playlist</div>
                  <div className="stat-value">{stats.playlistCount}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Spazio Usato</div>
                  <div className="stat-value">{formatBytes(stats.totalStorageBytes)}</div>
                </div>
                {stats.avgFileSize > 0 && (
                  <div className="stat-item">
                    <div className="stat-label">Media per Traccia</div>
                    <div className="stat-value">{formatBytes(stats.avgFileSize)}</div>
                  </div>
                )}
              </div>
              {stats.formatBreakdown && stats.formatBreakdown.length > 0 && (
                <div className="format-breakdown">
                  <h4>Formati File</h4>
                  <div className="format-list">
                    {stats.formatBreakdown.map((format, idx) => (
                      <div key={idx} className="format-item">
                        <span className="format-name">{format.format.toUpperCase() || 'Unknown'}</span>
                        <span className="format-count">{format.count} file</span>
                        <span className="format-size">{formatBytes(format.totalSize)}</span>
                        {format.avgBitrate > 0 && (
                          <span className="format-bitrate">~{Math.round(format.avgBitrate / 1000)}kbps</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form Fields */}
          <div className="form-group">
            <label htmlFor="email">Email *</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              placeholder="email@esempio.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              placeholder="Nome utente (opzionale)"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="Lascia vuoto per non modificare"
              minLength={8}
            />
            <small className="form-hint">Lascia vuoto per mantenere la password attuale</small>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="is_admin"
                checked={formData.is_admin}
                onChange={handleInputChange}
              />
              <span>Amministratore</span>
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

