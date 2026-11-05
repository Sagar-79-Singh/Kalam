import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { APP_NAME } from './constants';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Application render failed', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="flex min-h-screen items-center justify-center bg-bg p-6 text-fg"><div className="max-w-md text-center"><h1 className="font-display text-3xl">Let’s turn a fresh page.</h1><p className="my-4 text-sm leading-relaxed text-muted">{APP_NAME} encountered an unexpected interface error. Your saved conversations are still on this device.</p><pre className="my-5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-panel p-4 text-left font-mono text-xs text-muted">{this.state.error}</pre><button className="btn btn-primary" onClick={() => window.location.reload()}>Reload workspace</button></div></div>;
  }
}
const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');
createRoot(root).render(<ErrorBoundary><App /></ErrorBoundary>);
