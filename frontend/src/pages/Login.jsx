import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const [secret, setSecret] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!secret.trim()) return;

    setLoading(true);
    setError(null);

    const result = await login(secret);
    
    if (result.success) {
      navigate(from, { replace: true });
    } else {
      setError(result.error);
      setLoading(false);
    }
  };

  return (
    <div className="page-wrap" style={{ maxWidth: 400, margin: '80px auto' }}>
      <h2 style={{ marginBottom: 24, textAlign: 'center' }}>Network Login</h2>
      <div className="card">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <div className="error-box" style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 6, fontSize: 14 }}>{error}</div>}
          
          <div className="form-group">
            <label>API Secret</label>
            <input
              type="password"
              className="input-field"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Enter the shared secret"
              autoFocus
            />
          </div>
          
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Authenticating...' : 'Connect to Network'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
