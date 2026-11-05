import type { Settings } from '../types';
export function applyTheme(settings: Pick<Settings, 'theme' | 'font' | 'fontSize'>): void {
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.font = settings.font;
  root.style.colorScheme = dark ? 'dark' : 'light';
  root.style.backgroundColor = dark ? '#1F1E1B' : '#F5F1E8';
  root.style.setProperty('--chat-font-size', `${settings.fontSize}px`);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1F1E1B' : '#F5F1E8');
  // Appearance-only cache for standalone browser startup; desktop bootstrap comes from SQLite.
  try { localStorage.setItem('kalam:appearance', JSON.stringify({ theme: settings.theme, font: settings.font, fontSize: settings.fontSize })); } catch { /* Storage may be disabled in private windows. */ }
}
