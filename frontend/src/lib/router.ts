import { useEffect, useState } from 'react';

export type Route =
  | { name: 'login' }
  | { name: 'signup' }
  | { name: 'dashboard' }
  | { name: 'plan-new' }
  | { name: 'plan'; id: string }
  | { name: 'settings' }
  | { name: 'meter' };

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [first, second] = clean.split('/').filter(Boolean);

  if (first === 'login') return { name: 'login' };
  if (first === 'signup') return { name: 'signup' };
  if (first === 'settings') return { name: 'settings' };
  if (first === 'meter') return { name: 'meter' };
  if (first === 'plans' && second === 'new') return { name: 'plan-new' };
  if (first === 'plans' && second) return { name: 'plan', id: second };
  return { name: 'dashboard' };
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'login':
      return '#/login';
    case 'signup':
      return '#/signup';
    case 'settings':
      return '#/settings';
    case 'meter':
      return '#/meter';
    case 'plan-new':
      return '#/plans/new';
    case 'plan':
      return `#/plans/${route.id}`;
    case 'dashboard':
      return '#/';
  }
}

export function navigate(route: Route): void {
  window.location.hash = hrefFor(route);
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
