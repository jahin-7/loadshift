import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth.js';
import { hrefFor } from '../lib/router.js';
import { ApiClientError } from '../lib/api.js';
import Mark from './Mark.js';
import GoogleSignInButton from './GoogleSignInButton.js';
import PasswordField from './PasswordField.js';

export default function LoginView() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not log in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-card__brand">
          <span>
            <Mark size={22} />
          </span>
          LoadShift
        </div>
        <p className="auth-card__tagline">Plan your day around the power, not around guesswork.</p>

        <GoogleSignInButton onError={setError} />

        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <PasswordField label="Password" value={password} onChange={setPassword} />

        {error && <div className="form-error">{error}</div>}

        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="auth-card__switch">
          New here? <a href={hrefFor({ name: 'signup' })}>Create an account</a>
        </p>
      </form>
    </div>
  );
}
