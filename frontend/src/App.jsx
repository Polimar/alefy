import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import Login from './pages/Login';
import Register from './pages/Register';
import Library from './pages/Library';
import Upload from './pages/Upload';
import Playlists from './pages/Playlists';
import PlaylistDetail from './pages/PlaylistDetail';
import PublicPlaylists from './pages/PublicPlaylists';
import Users from './pages/Users';
import YouTubeCookies from './pages/YouTubeCookies';
import Share from './pages/Share';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  const { checkAuth, isAuthenticated, loading } = useAuthStore();

  useEffect(() => {
    // Chiama checkAuth solo una volta al mount
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Array vuoto per chiamare solo al mount

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <div>Caricamento...</div>
      </div>
    );
  }

  return (
    <Routes>
        <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />
        <Route path="/register" element={!isAuthenticated ? <Register /> : <Navigate to="/" />} />
        <Route path="/share/:token" element={<Share />} />
      <Route
        path="/"
        element={isAuthenticated ? <Layout /> : <Navigate to="/login" />}
      >
        <Route index element={<Library />} />
        <Route path="upload" element={<Upload />} />
        <Route path="playlists" element={<Playlists />} />
        <Route path="playlists/:id" element={<PlaylistDetail />} />
        <Route path="discover" element={<PublicPlaylists />} />
        <Route 
          path="users" 
          element={
            <ProtectedRoute requireAdmin={true}>
              <Users />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="youtube-cookies" 
          element={
            <ProtectedRoute requireAdmin={true}>
              <YouTubeCookies />
            </ProtectedRoute>
          } 
        />
      </Route>
    </Routes>
  );
}

export default App;

