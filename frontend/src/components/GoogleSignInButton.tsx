import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../lib/auth.js';

interface GoogleSignInButtonProps {
  onError: (message: string) => void;
}

export default function GoogleSignInButton({ onError }: GoogleSignInButtonProps) {
  const { loginWithGoogle } = useAuth();
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!clientId) return null;

  return (
    <div className="auth-card__google">
      <GoogleLogin
        theme="filled_black"
        shape="rectangular"
        width="100%"
        onSuccess={(response) => {
          if (!response.credential) {
            onError('Google did not return a usable credential.');
            return;
          }
          loginWithGoogle(response.credential).catch(() => onError('Could not sign in with Google.'));
        }}
        onError={() => onError('Google sign-in failed.')}
      />
      <div className="auth-card__divider">
        <span>or continue with email</span>
      </div>
    </div>
  );
}
