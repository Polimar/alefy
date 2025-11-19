import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { Home, Upload, ListMusic, LogOut, Menu, X, Users } from 'lucide-react';
import Player from './Player';
import './Layout.css';

export default function Layout() {
  const { logout, user } = useAuthStore();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

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

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="layout">
      {isMobile && (
        <button 
          className="mobile-menu-btn"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
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
          <h1>ALEFY</h1>
        </div>
        <nav className="sidebar-nav">
          <Link
            to="/"
            className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}
          >
            <Home size={20} />
            <span>Libreria</span>
          </Link>
          <Link
            to="/upload"
            className={`nav-item ${location.pathname === '/upload' ? 'active' : ''}`}
          >
            <Upload size={20} />
            <span>Carica</span>
          </Link>
          <Link
            to="/playlists"
            className={`nav-item ${location.pathname === '/playlists' ? 'active' : ''}`}
          >
            <ListMusic size={20} />
            <span>Playlist</span>
          </Link>
          {user?.is_admin && (
            <Link
              to="/users"
              className={`nav-item ${location.pathname === '/users' ? 'active' : ''}`}
            >
              <Users size={20} />
              <span>Utenti</span>
            </Link>
          )}
        </nav>
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

