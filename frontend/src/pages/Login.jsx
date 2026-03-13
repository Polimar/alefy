import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import './Auth.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, hasCachedSession, enterWithCachedSession } = useAuthStore();
  const navigate = useNavigate();

  const isNetworkError = (msg) =>
    msg && (msg.includes('Network Error') || msg.includes('Failed to fetch') || msg.includes('timeout'));

  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine && hasCachedSession()) {
      if (enterWithCachedSession()) {
        navigate('/');
      }
    }
  }, [hasCachedSession, enterWithCachedSession, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const testKey = '__localStorage_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
    } catch (storageError) {
      setLoading(false);
      setError('Il browser non permette l\'uso di localStorage. Disattiva la modalità privata o verifica le impostazioni del browser.');
      return;
    }

    const result = await login(email, password);
    setLoading(false);

    if (result.success) {
      navigate('/');
    } else if (isNetworkError(result.error) && hasCachedSession()) {
      if (enterWithCachedSession()) {
        navigate('/');
      } else {
        setError(result.error);
      }
    } else {
      setError(result.error);
    }
  };

  const handleEnterOffline = () => {
    if (enterWithCachedSession()) {
      navigate('/');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>ALEFY <span className="auth-version-badge">v2</span></h1>
        <h2>Accedi</h2>
        <form onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Accesso...' : 'Accedi'}
          </button>
          {hasCachedSession() && (
            <button
              type="button"
              className="submit-btn submit-btn-secondary"
              onClick={handleEnterOffline}
              disabled={loading}
            >
              Entra offline
            </button>
          )}
        </form>
        <p className="auth-link">
          Non hai un account? <Link to="/register">Registrati</Link>
        </p>
      </div>
    </div>
  );
}

