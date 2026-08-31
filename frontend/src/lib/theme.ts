export type Theme = 'dark' | 'light';

const KEY = 'loadshift.theme';

export function getTheme(): Theme {
  return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(KEY, theme);
  document.documentElement.dataset.theme = theme;
}

export function applyStoredTheme(): void {
  document.documentElement.dataset.theme = getTheme();
}
