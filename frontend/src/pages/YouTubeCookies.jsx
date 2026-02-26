import { useState, useEffect } from 'react';
import api from '../utils/api';
import { Upload, Trash2, CheckCircle, XCircle, AlertCircle, Play } from 'lucide-react';
import './YouTubeCookies.css';

export default function YouTubeCookies() {
  const [cookies, setCookies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [description, setDescription] = useState('');
  const [testingCookies, setTestingCookies] = useState(new Set());
  const [testResults, setTestResults] = useState({});

  useEffect(() => {
    loadCookies();
  }, []);

  const loadCookies = async () => {
    try {
      setLoading(true);
      const response = await api.get('/youtube/cookies');
      setCookies(response.data.data.cookies);
    } catch (error) {
      console.error('Error loading cookies:', error);
      alert('Errore nel caricamento dei cookies');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      alert('Seleziona un file cookies');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('cookies', selectedFile);
      if (description.trim()) {
        formData.append('description', description.trim());
      }

      await api.post('/youtube/cookies/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setSelectedFile(null);
      setDescription('');
      document.getElementById('cookies-file').value = '';
      loadCookies();
      alert('Cookies caricati con successo!');
    } catch (error) {
      console.error('Error uploading cookies:', error);
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Errore nel caricamento dei cookies';
      alert(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleToggleActive = async (id, currentActive) => {
    try {
      await api.put(`/youtube/cookies/${id}`, {
        is_active: !currentActive,
      });
      loadCookies();
    } catch (error) {
      console.error('Error updating cookies:', error);
      alert('Errore nell\'aggiornamento dei cookies');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Eliminare questi cookies?')) return;

    try {
      await api.delete(`/youtube/cookies/${id}`);
      loadCookies();
    } catch (error) {
      console.error('Error deleting cookies:', error);
      alert('Errore nell\'eliminazione dei cookies');
    }
  };

  const handleTestCookies = async (id) => {
    if (testingCookies.has(id)) return;

    setTestingCookies(prev => new Set(prev).add(id));
    setTestResults(prev => ({ ...prev, [id]: null }));

    try {
      const response = await api.post(`/youtube/cookies/${id}/test`);
      setTestResults(prev => ({
        ...prev,
        [id]: {
          success: response.data.success,
          message: response.data.message,
        },
      }));
    } catch (error) {
      console.error('Error testing cookies:', error);
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Errore durante il test';
      setTestResults(prev => ({
        ...prev,
        [id]: {
          success: false,
          message: errorMessage,
        },
      }));
    } finally {
      setTestingCookies(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('it-IT');
  };

  if (loading) {
    return (
      <div className="youtube-cookies">
        <div className="loading">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="youtube-cookies">
      <div className="youtube-cookies-header">
        <h1>Cookies YouTube</h1>
        <p className="description">
          Carica i cookies di sessione YouTube per evitare blocchi durante le ricerche.
          <br />
          <strong>Come ottenere i cookies:</strong>
          <br />
          1. Installa l'estensione "Get cookies.txt LOCALLY" o "cookies.txt" nel tuo browser
          <br />
          2. Accedi a YouTube nel browser
          <br />
          3. Esporta i cookies per youtube.com in formato Netscape (.txt)
          <br />
          4. Carica il file qui
        </p>
      </div>

      <div className="upload-section">
        <h2>Carica Nuovi Cookies</h2>
        <form onSubmit={handleUpload} className="upload-form">
          <div className="form-group">
            <label htmlFor="cookies-file">File Cookies (.txt)</label>
            <input
              id="cookies-file"
              type="file"
              accept=".txt"
              onChange={handleFileSelect}
              required
            />
            {selectedFile && (
              <div className="file-info">
                File selezionato: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
              </div>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="description">Descrizione (opzionale)</label>
            <input
              id="description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Es: Cookies da Chrome - Novembre 2024"
            />
          </div>
          <button
            type="submit"
            disabled={!selectedFile || uploading}
            className="upload-btn"
          >
            {uploading ? (
              <>
                <Upload size={16} className="spinning" /> Caricamento...
              </>
            ) : (
              <>
                <Upload size={16} /> Carica Cookies
              </>
            )}
          </button>
        </form>
      </div>

      <div className="cookies-list">
        <h2>Cookies Salvati</h2>
        {cookies.length === 0 ? (
          <div className="empty-state">
            <AlertCircle size={48} />
            <p>Nessun cookies caricato</p>
          </div>
        ) : (
          <table className="cookies-table">
            <thead>
              <tr>
                <th>Stato</th>
                <th>Caricato da</th>
                <th>Data</th>
                <th>Descrizione</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {cookies.map((cookie) => (
                <tr key={cookie.id} className={cookie.is_active ? 'active' : ''}>
                  <td>
                    {cookie.is_active ? (
                      <span className="status-badge active">
                        <CheckCircle size={16} /> Attivo
                      </span>
                    ) : (
                      <span className="status-badge inactive">
                        <XCircle size={16} /> Inattivo
                      </span>
                    )}
                  </td>
                  <td>{cookie.uploaded_by_username || 'Sconosciuto'}</td>
                  <td>{formatDate(cookie.uploaded_at)}</td>
                  <td>{cookie.description || '-'}</td>
                  <td>
                    <div className="actions">
                      <button
                        onClick={() => handleTestCookies(cookie.id)}
                        disabled={testingCookies.has(cookie.id)}
                        className="test-btn"
                        title="Testa connessione"
                      >
                        {testingCookies.has(cookie.id) ? (
                          <>
                            <Play size={14} className="spinning" /> Test...
                          </>
                        ) : (
                          <>
                            <Play size={14} /> Test
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleToggleActive(cookie.id, cookie.is_active)}
                        className={`toggle-btn ${cookie.is_active ? 'deactivate' : 'activate'}`}
                        title={cookie.is_active ? 'Disattiva' : 'Attiva'}
                      >
                        {cookie.is_active ? 'Disattiva' : 'Attiva'}
                      </button>
                      <button
                        onClick={() => handleDelete(cookie.id)}
                        className="delete-btn"
                        title="Elimina"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {testResults[cookie.id] && (
                      <div className={`test-result ${testResults[cookie.id].success ? 'success' : 'error'}`}>
                        {testResults[cookie.id].success ? (
                          <CheckCircle size={14} />
                        ) : (
                          <XCircle size={14} />
                        )}
                        <span>{testResults[cookie.id].message}</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

