import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App.js';
import { AuthProvider } from './lib/auth.js';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function MaybeGoogleProvider({ children }: { children: ReactNode }) {
  return googleClientId ? (
    <GoogleOAuthProvider clientId={googleClientId}>{children}</GoogleOAuthProvider>
  ) : (
    <>{children}</>
  );
}

createRoot(container).render(
  <StrictMode>
    <MaybeGoogleProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MaybeGoogleProvider>
  </StrictMode>,
);
