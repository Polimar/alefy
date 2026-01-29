import { useState, useEffect } from 'react';
import { X, Loader2, Key, Plus, Trash2, Copy, Check } from 'lucide-react';
import api from '../utils/api';
import './EditUserModal.css';

export default function EditUserModal({ user, isOpen, onClose, onUpdate, isAdmin }) {
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
  const [apiTokens, setApiTokens] = useState([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [showCreateToken, setShowCreateToken] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [creatingToken, setCreatingToken] = useState(false);
  const [createdTokenPlain, setCreatedTokenPlain] = useState(null);
  const [revokingId, setRevokingId] = useState(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  useEffect(() => {
    if (user && isOpen) {
      setFormData({
        email: user.email || '',
        username: user.username || '',
        password: '',
        is_admin: user.is_admin || false,
      });
      setError('');
      setCreatedTokenPlain(null);
      loadUserStats();
      if (isAdmin) loadApiTokens();
    }
  }, [user, isOpen, isAdmin]);

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

  const loadApiTokens = async () => {
    try {
      setLoadingTokens(true);
      const response = await api.get('/api-tokens');
      if (response.data.success && response.data.data.tokens) {
        const forUser = response.data.data.tokens.filter((t) => t.user_id === user.id);
        setApiTokens(forUser);
      }
    } catch (err) {
      console.error('Error loading API tokens:', err);
    } finally {
      setLoadingTokens(false);
    }
  };

  const handleCreateToken = async (e) => {
    e.preventDefault();
    if (!newTokenName.trim() || !user?.id) return;
    try {
      setCreatingToken(true);
      const response = await api.post('/api-tokens', {
        name: newTokenName.trim(),
        user_id: user.id,
      });
      if (response.data.success && response.data.data.token) {
        setCreatedTokenPlain(response.data.data.token);
        setShowCreateToken(false);
        setNewTokenName('');
        loadApiTokens();
      }
    } catch (err) {
      console.error('Error creating API token:', err);
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Errore nella creazione del token';
      setError(msg);
    } finally {
      setCreatingToken(false);
    }
  };

  const handleRevokeToken = async (tokenId) => {
    if (!confirm('Revocare questo token? Non potrà più essere usato.')) return;
    try {
      setRevokingId(tokenId);
      await api.delete(`/api-tokens/${tokenId}`);
      loadApiTokens();
    } catch (err) {
      console.error('Error revoking token:', err);
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopyToken = async () => {
    if (!createdTokenPlain) return;
    try {
      await navigator.clipboard.writeText(createdTokenPlain);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const formatTokenDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
                        <span className="format-name">{(format.format || 'NULL').toUpperCase()}</span>
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
              {stats.diagnostic && (
                <div className="diagnostic-info">
                  <h4>Diagnostica</h4>
                  {stats.diagnostic.nullFormatCount > 0 && (
                    <div className="diagnostic-warning">
                      ⚠️ {stats.diagnostic.nullFormatCount} file senza formato ({formatBytes(stats.diagnostic.nullFormatSize)})
                    </div>
                  )}
                  {stats.diagnostic.zeroSizeCount > 0 && (
                    <div className="diagnostic-warning">
                      ⚠️ {stats.diagnostic.zeroSizeCount} file con dimensione 0
                    </div>
                  )}
                  {stats.diagnostic.largeFileCount > 0 && (
                    <div className="diagnostic-info-text">
                      ℹ️ {stats.diagnostic.largeFileCount} file grandi (&gt;100MB): {formatBytes(stats.diagnostic.largeFileSize)}
                    </div>
                  )}
                  <div className="diagnostic-info-text">
                    Totale tracce nel DB: {stats.diagnostic.totalTracksInDb}
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

          {/* Token API (solo admin) */}
          {isAdmin && (
            <div className="user-api-tokens">
              <h3>
                <Key size={16} />
                Token API
              </h3>
              <p className="api-tokens-hint">
                I token permettono a software esterni (es. Beat Saber) di accedere all&apos;API con questo utente.
              </p>
              {loadingTokens ? (
                <div className="api-tokens-loading">
                  <Loader2 size={18} className="spinning" />
                  Caricamento token...
                </div>
              ) : (
                <>
                  <div className="api-tokens-list">
                    {apiTokens.length === 0 ? (
                      <div className="api-tokens-empty">Nessun token per questo utente.</div>
                    ) : (
                      apiTokens.map((t) => (
                        <div key={t.id} className="api-token-row">
                          <div className="api-token-info">
                            <span className="api-token-name">{t.name}</span>
                            <span className="api-token-meta">
                              Creato {formatTokenDate(t.created_at)}
                              {t.last_used_at && ` · Ultimo uso ${formatTokenDate(t.last_used_at)}`}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="api-token-revoke"
                            onClick={() => handleRevokeToken(t.id)}
                            disabled={revokingId === t.id}
                            title="Revoca token"
                          >
                            {revokingId === t.id ? (
                              <Loader2 size={14} className="spinning" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  {!showCreateToken ? (
                    <button
                      type="button"
                      className="btn-create-token"
                      onClick={() => setShowCreateToken(true)}
                    >
                      <Plus size={16} />
                      Crea token
                    </button>
                  ) : (
                    <form onSubmit={handleCreateToken} className="api-token-create-form">
                      <input
                        type="text"
                        value={newTokenName}
                        onChange={(e) => setNewTokenName(e.target.value)}
                        placeholder="Nome (es. Beat Saber client)"
                        className="api-token-name-input"
                        autoFocus
                        maxLength={255}
                      />
                      <div className="api-token-create-actions">
                        <button
                          type="button"
                          className="btn-secondary btn-small"
                          onClick={() => {
                            setShowCreateToken(false);
                            setNewTokenName('');
                          }}
                        >
                          Annulla
                        </button>
                        <button
                          type="submit"
                          className="btn-primary btn-small"
                          disabled={creatingToken || !newTokenName.trim()}
                        >
                          {creatingToken ? (
                            <>
                              <Loader2 size={14} className="spinning" />
                              Creazione...
                            </>
                          ) : (
                            'Crea'
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          )}

          {/* Mostra token appena creato (copia una sola volta) */}
          {createdTokenPlain && (
            <div className="api-token-new-overlay">
              <div className="api-token-new-box">
                <h4>Token creato</h4>
                <p className="api-token-warning">
                  Copia il token ora: non sarà più mostrato.
                </p>
                <div className="api-token-value-row">
                  <code className="api-token-value">{createdTokenPlain}</code>
                  <button
                    type="button"
                    className="btn-copy-token"
                    onClick={handleCopyToken}
                    title="Copia"
                  >
                    {tokenCopied ? <Check size={18} /> : <Copy size={18} />}
                    {tokenCopied ? ' Copiato' : ' Copia'}
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => setCreatedTokenPlain(null)}
                >
                  Chiudi
                </button>
              </div>
            </div>
          )}

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

