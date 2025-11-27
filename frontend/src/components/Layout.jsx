import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { Home, Upload, ListMusic, LogOut, Menu, X, Users, Settings, Music } from 'lucide-react';
import Player from './Player';
import api from '../utils/api';
import './Layout.css';

export default function Layout() {
  const { logout, user } = useAuthStore();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [metadataStats, setMetadataStats] = useState({ total: 0, processed: 0, recognized: 0 });

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Chiudi sidebar quando cambi pagina su mobile
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location.pathname, isMobile]);

  useEffect(() => {
    // Carica statistiche metadati
    const loadMetadataStats = async () => {
      try {
        const response = await api.get('/stats');
        console.log('[Layout] Risposta API stats:', response.data);
        if (response.data.success && response.data.data) {
          // Usa metadataStats se disponibile, altrimenti crea oggetto con valori di default
          const stats = response.data.data.metadataStats || {
            total: response.data.data.trackCount || 0,
            processed: 0,
            recognized: 0,
          };
          console.log('[Layout] Statistiche metadati caricate:', stats);
          setMetadataStats(stats);
        } else {
          console.warn('[Layout] Risposta API stats non valida:', response.data);
        }
      } catch (error) {
        console.error('[Layout] Errore caricamento statistiche metadati:', error);
        console.error('[Layout] Dettagli errore:', error.response?.data || error.message);
        // In caso di errore, mostra comunque valori di default
        setMetadataStats({
          total: 0,
          processed: 0,
          recognized: 0,
        });
      }
    };
    
    loadMetadataStats();
    // Aggiorna ogni 30 secondi
    const interval = setInterval(loadMetadataStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="layout">
      {isMobile && !sidebarOpen && (
        <button 
          className="mobile-menu-btn"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle menu"
        >
          <Menu size={24} />
        </button>
      )}
      {isMobile && sidebarOpen && (
        <div 
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          {isMobile && (
            <button
              className="sidebar-close-btn"
              onClick={() => setSidebarOpen(false)}
              aria-label="Chiudi menu"
            >
              <X size={20} />
            </button>
          )}
          <h1>ALEFY</h1>
        </div>
        <nav className="sidebar-nav">
          <Link
            to="/"
            className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}
            onClick={() => isMobile && setSidebarOpen(false)}
          >
            <Home size={20} />
            <span>Libreria</span>
          </Link>
          <Link
            to="/upload"
            className={`nav-item ${location.pathname === '/upload' ? 'active' : ''}`}
            onClick={() => isMobile && setSidebarOpen(false)}
          >
            <Upload size={20} />
            <span>Carica</span>
          </Link>
          <Link
            to="/playlists"
            className={`nav-item ${location.pathname === '/playlists' ? 'active' : ''}`}
            onClick={() => isMobile && setSidebarOpen(false)}
          >
            <ListMusic size={20} />
            <span>Playlist</span>
          </Link>
          {user?.is_admin && (
            <>
              <Link
                to="/users"
                className={`nav-item ${location.pathname === '/users' ? 'active' : ''}`}
                onClick={() => isMobile && setSidebarOpen(false)}
              >
                <Users size={20} />
                <span>Utenti</span>
              </Link>
              <Link
                to="/youtube-cookies"
                className={`nav-item ${location.pathname === '/youtube-cookies' ? 'active' : ''}`}
                onClick={() => isMobile && setSidebarOpen(false)}
              >
                <Settings size={20} />
                <span>Cookies YouTube</span>
              </Link>
            </>
          )}
        </nav>
        <div className="metadata-stats">
            <div className="metadata-stats-header">
              <Music size={16} />
              <span>Metadati</span>
            </div>
            <div className="metadata-stats-content">
              <div className="metadata-stat-item">
                <span className="metadata-stat-label">Totali:</span>
                <span className="metadata-stat-value">{metadataStats.total}</span>
              </div>
              <div className="metadata-stat-item">
                <span className="metadata-stat-label">Processate:</span>
                <span className="metadata-stat-value">{metadataStats.processed}</span>
              </div>
              <div className="metadata-stat-item">
                <span className="metadata-stat-label">Riconosciute:</span>
                <span className="metadata-stat-value metadata-stat-recognized">{metadataStats.recognized}</span>
              </div>
            </div>
          </div>
        )}
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.username?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="user-details">
              <div className="user-name">{user?.username || user?.email}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
      <Player />
    </div>
  );
}

