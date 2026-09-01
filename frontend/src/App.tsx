import { useEffect, useState } from 'react';
import { useAuth } from './lib/auth.js';
import { hrefFor, useHashRoute, type Route } from './lib/router.js';
import LoginView from './components/LoginView.js';
import SignupView from './components/SignupView.js';
import Dashboard from './components/Dashboard.js';
import PlanBuilder from './components/PlanBuilder.js';
import PlanView from './components/PlanView.js';
import SettingsView from './components/SettingsView.js';
import MeterView from './components/MeterView.js';
import Mark from './components/Mark.js';

const PAGE_TITLES: Record<Route['name'], string> = {
  login: 'Sign in',
  signup: 'Create account',
  dashboard: 'Your day plans',
  'plan-new': 'New plan',
  plan: 'Plan',
  settings: 'Settings',
  meter: 'Electricity meter',
};

function usePageTitle(route: Route) {
  useEffect(() => {
    document.title = `${PAGE_TITLES[route.name]} — LoadShift`;
  }, [route.name]);
}

export default function App() {
  const { user, loading, logout } = useAuth();
  const route = useHashRoute();
  const [navOpen, setNavOpen] = useState(false);
  usePageTitle(route);

  useEffect(() => {
    setNavOpen(false);
  }, [route]);

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
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="topbar">
        <a className="brand" href={hrefFor({ name: 'dashboard' })}>
          <span className="brand__mark">
            <Mark size={19} />
          </span>
          LoadShift
        </a>
        <button
          type="button"
          className="topbar__toggle"
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={navOpen}
          onClick={() => setNavOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        <nav className={navOpen ? 'topbar__nav is-open' : 'topbar__nav'}>
          <a href={hrefFor({ name: 'dashboard' })}>Plans</a>
          <a href={hrefFor({ name: 'meter' })}>Meter</a>
          <a href={hrefFor({ name: 'settings' })}>Settings</a>
          <span className="topbar__shop">{user.shopName}</span>
          <button type="button" onClick={logout} className="link-button">
            Log out
          </button>
        </nav>
      </header>
      <main className="app-main" id="main-content">
        {route.name === 'plan-new' && <PlanBuilder />}
        {route.name === 'plan' && <PlanView planId={route.id} />}
        {route.name === 'settings' && <SettingsView />}
        {route.name === 'meter' && <MeterView />}
        {route.name === 'dashboard' && <Dashboard />}
        {route.name === 'login' && <Dashboard />}
        {route.name === 'signup' && <Dashboard />}
      </main>
      <footer className="app-footer">© {new Date().getFullYear()} LoadShift</footer>
    </div>
  );
}
