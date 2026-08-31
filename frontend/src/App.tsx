import { useAuth } from './lib/auth.js';
import { hrefFor, useHashRoute } from './lib/router.js';
import LoginView from './components/LoginView.js';
import SignupView from './components/SignupView.js';
import Dashboard from './components/Dashboard.js';
import PlanBuilder from './components/PlanBuilder.js';
import PlanView from './components/PlanView.js';
import SettingsView from './components/SettingsView.js';
import MeterView from './components/MeterView.js';
import Mark from './components/Mark.js';

export default function App() {
  const { user, loading, logout } = useAuth();
  const route = useHashRoute();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return route.name === 'signup' ? <SignupView /> : <LoginView />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href={hrefFor({ name: 'dashboard' })}>
          <span className="brand__mark">
            <Mark size={19} />
          </span>
          LoadShift
        </a>
        <nav className="topbar__nav">
          <a href={hrefFor({ name: 'dashboard' })}>Plans</a>
          <a href={hrefFor({ name: 'meter' })}>Meter</a>
          <a href={hrefFor({ name: 'settings' })}>Settings</a>
          <span className="topbar__shop">{user.shopName}</span>
          <button type="button" onClick={logout} className="link-button">
            Log out
          </button>
        </nav>
      </header>
      <main className="app-main">
        {route.name === 'plan-new' && <PlanBuilder />}
        {route.name === 'plan' && <PlanView planId={route.id} />}
        {route.name === 'settings' && <SettingsView />}
        {route.name === 'meter' && <MeterView />}
        {route.name === 'dashboard' && <Dashboard />}
        {route.name === 'login' && <Dashboard />}
        {route.name === 'signup' && <Dashboard />}
      </main>
    </div>
  );
}
