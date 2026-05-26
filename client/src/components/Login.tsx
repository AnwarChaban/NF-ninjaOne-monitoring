import React, { useState } from 'react';
import { login, setAuthSession } from '../api';

interface Props {
  onLogin: () => void;
}

export default function Login({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!username.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const { token, user } = await login(username.trim(), password || undefined);
      setAuthSession(token, user);
      onLogin();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'Kennwort erforderlich') {
        setNeedsPassword(true);
        setSubmitting(false);
        return;
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleLogin();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    backgroundColor: '#0f172a', border: '1px solid #334155',
    color: '#f1f5f9', fontSize: '15px', outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#0f172a',
    }}>
      <div style={{
        backgroundColor: '#1e293b', borderRadius: '12px', padding: '40px 48px',
        width: '100%', maxWidth: '400px', border: '1px solid #334155',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#34d399"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px' }}>
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>
            NetFactory Monitoring
          </h1>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>
            Benutzername
          </label>
          <input
            type="text"
            value={username}
            onChange={e => { setUsername(e.target.value); setNeedsPassword(false); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="Benutzername eingeben"
            autoFocus
            style={inputStyle}
          />
        </div>

        {needsPassword && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' }}>
              Kennwort
            </label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              placeholder="Kennwort eingeben"
              autoFocus
              style={inputStyle}
            />
          </div>
        )}

        {error && (
          <p style={{
            color: '#fca5a5', fontSize: '13px', backgroundColor: '#7f1d1d',
            padding: '8px 12px', borderRadius: '6px', marginBottom: '16px',
          }}>
            {error}
          </p>
        )}

        <button
          onClick={handleLogin}
          disabled={submitting || !username.trim()}
          style={{
            width: '100%', padding: '12px', borderRadius: '8px', marginTop: '4px',
            backgroundColor: (submitting || !username.trim()) ? '#1e3a5f' : '#3b82f6',
            border: 'none', color: '#fff', fontSize: '15px',
            fontWeight: 700, cursor: (submitting || !username.trim()) ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.15s',
          }}
        >
          {submitting ? 'Anmelden...' : 'Anmelden'}
        </button>
      </div>
    </div>
  );
}
