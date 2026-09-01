import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth.js';
import { hrefFor } from '../lib/router.js';
import { ApiClientError } from '../lib/api.js';
import Mark from './Mark.js';
import GoogleSignInButton from './GoogleSignInButton.js';
import PasswordField from './PasswordField.js';

export default function SignupView() {
  const { signup } = useAuth();
  const [shopName, setShopName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await signup(email.trim(), password, shopName.trim());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not create your account.');
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
        <p className="auth-card__tagline">Create your shop's account.</p>

        <GoogleSignInButton onError={setError} />

        <label>
          Shop name
          <input required value={shopName} onChange={(e) => setShopName(e.target.value)} autoFocus />
        </label>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <PasswordField label="Password" value={password} onChange={setPassword} minLength={8} hint="At least 8 characters." />

        {error && <div className="form-error">{error}</div>}

        <button type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>

        <p className="auth-card__switch">
          Already have an account? <a href={hrefFor({ name: 'login' })}>Sign in</a>
        </p>
      </form>
    </div>
  );
}
