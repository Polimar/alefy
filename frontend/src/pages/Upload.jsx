import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Download, Music } from 'lucide-react';
import './Upload.css';

export default function Upload() {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({});
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [youtubeError, setYoutubeError] = useState(null);
  const [downloadStartTime, setDownloadStartTime] = useState(null);

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

    let timeoutId = null;
    let updateMessageInterval = null;

    try {
      setDownloading(true);
      setYoutubeError(null);
      const startTime = Date.now();
      setDownloadStartTime(startTime);
      
      // Stato iniziale
      setDownloadProgress({ status: 'downloading', message: 'Connessione a YouTube...', stage: 'init' });

      // Timeout di sicurezza (5 minuti)
      timeoutId = setTimeout(() => {
        setDownloadProgress({ status: 'error', message: 'Timeout: il download sta impiegando troppo tempo' });
        setYoutubeError('Il download sta impiegando troppo tempo. Riprova più tardi.');
        setDownloading(false);
      }, 5 * 60 * 1000);

      // Aggiorna il messaggio con il tempo trascorso
      updateMessageInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const stages = [
          { stage: 'init', message: 'Connessione a YouTube...' },
          { stage: 'download', message: 'Download audio in corso...' },
          { stage: 'process', message: 'Elaborazione metadati...' },
          { stage: 'save', message: 'Salvataggio nel database...' },
        ];
        const currentStage = stages[Math.min(Math.floor(elapsed / 10), stages.length - 1)];
        setDownloadProgress(prev => {
          if (prev && prev.status === 'downloading') {
            return {
              ...prev,
              message: `${currentStage.message} (${elapsed}s)`,
              stage: currentStage.stage
            };
          }
          return prev;
        });
      }, 1000);

      const response = await api.post('/youtube/download', {
        url: youtubeUrl.trim(),
      });

      // Download completato con successo
      if (timeoutId) clearTimeout(timeoutId);
      if (updateMessageInterval) clearInterval(updateMessageInterval);
      
      setDownloadProgress({ status: 'success', message: 'Download completato!', stage: 'complete' });
      setYoutubeUrl('');
      
      // Refresh library after a short delay
      setTimeout(() => {
        navigate('/');
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error('YouTube download error:', error);
      if (timeoutId) clearTimeout(timeoutId);
      if (updateMessageInterval) clearInterval(updateMessageInterval);
      
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Errore durante il download';
      setYoutubeError(errorMessage);
      setDownloadProgress({ status: 'error', message: errorMessage });
    } finally {
      setDownloading(false);
      setTimeout(() => {
        setDownloadProgress(null);
        setDownloadStartTime(null);
      }, 3000);
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

  return (
    <div className="upload">
      <h1>Carica Brani</h1>

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
              disabled={downloading}
            />
            <button
              type="submit"
              disabled={downloading || !youtubeUrl.trim() || !isValidYouTubeUrl(youtubeUrl)}
              className="youtube-download-btn"
            >
              {downloading ? 'Download...' : 'Scarica'}
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
          {downloadProgress && (
            <div className={`youtube-progress ${downloadProgress.status}`}>
              <div className="progress-message">{downloadProgress.message}</div>
              {downloadProgress.status === 'downloading' && (
                <div className="progress-bar-container">
                  <div className="progress-bar">
                    <div className="progress-fill progress-indeterminate" />
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </div>

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
    </div>
  );
}

