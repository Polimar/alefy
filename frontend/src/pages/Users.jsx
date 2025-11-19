import { useState, useEffect } from 'react';
import api from '../utils/api';
import { Plus, User, Mail, Calendar, Shield } from 'lucide-react';
import './Users.css';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/users');
      setUsers(response.data.data.users);
    } catch (error) {
      console.error('Error loading users:', error);
      alert('Errore nel caricamento degli utenti');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Email e password sono obbligatorie');
      return;
    }

    if (password.length < 8) {
      setError('La password deve essere almeno 8 caratteri');
      return;
    }

    try {
      setCreating(true);
      setError('');
      await api.post('/users', {
        email: email.trim(),
        password: password.trim(),
        username: username.trim() || null,
      });
      setShowModal(false);
      setEmail('');
      setPassword('');
      setUsername('');
      loadUsers();
    } catch (error) {
      console.error('Error creating user:', error);
      const errorMessage = error.response?.data?.message || error.response?.data?.error?.message || 'Errore nella creazione dell\'utente';
      setError(errorMessage);
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="users">
      <div className="users-header">
        <h1>Gestione Utenti</h1>
        <button 
          className="create-user-btn"
          onClick={() => setShowModal(true)}
        >
          <Plus size={20} />
          Aggiungi Utente
        </button>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => {
          setShowModal(false);
          setEmail('');
          setPassword('');
          setUsername('');
          setError('');
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Aggiungi Nuovo Utente</h2>
            <form onSubmit={handleCreateUser}>
              {error && <div className="error-message">{error}</div>}
              <div className="form-group">
                <label htmlFor="user-email">Email *</label>
                <input
                  id="user-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@esempio.com"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="user-password">Password *</label>
                <input
                  id="user-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimo 8 caratteri"
                  required
                  minLength={8}
                />
              </div>
              <div className="form-group">
                <label htmlFor="user-username">Username</label>
                <input
                  id="user-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nome utente (opzionale)"
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEmail('');
                    setPassword('');
                    setUsername('');
                    setError('');
                  }}
                  className="btn-cancel"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={creating || !email.trim() || !password.trim()}
                  className="btn-primary"
                >
                  {creating ? 'Creazione...' : 'Crea Utente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading">Caricamento...</div>
      ) : users.length === 0 ? (
        <div className="empty-state">
          <User size={48} />
          <p>Nessun utente trovato</p>
        </div>
      ) : (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>Utente</th>
                <th>Email</th>
                <th>Ruolo</th>
                <th>Registrato</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="user-info">
                    <div className="user-avatar">
                      {user.username ? user.username.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="user-details">
                      <div className="user-name">{user.username || 'Nessun username'}</div>
                      <div className="user-id">ID: {user.id}</div>
                    </div>
                  </td>
                  <td className="user-email">
                    <Mail size={16} />
                    {user.email}
                  </td>
                  <td className="user-role">
                    {user.is_admin ? (
                      <span className="admin-badge">
                        <Shield size={14} />
                        Admin
                      </span>
                    ) : (
                      <span className="user-badge">Utente</span>
                    )}
                  </td>
                  <td className="user-date">
                    <Calendar size={16} />
                    {formatDate(user.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

