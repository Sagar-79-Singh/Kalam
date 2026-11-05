import * as React from 'react';
import { createRoot } from 'react-dom/client';
import * as Icons from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

declare global { interface Window { renderArtifact: (mode: string, source: string) => void } }
function showError(error: unknown): void {
  const root = document.getElementById('root'); if (!root) return;
  root.textContent = error instanceof Error ? error.message : String(error);
  root.style.cssText = 'color:#b34c3c;padding:24px;font:14px/1.7 ui-monospace,monospace;white-space:pre-wrap';
}
window.addEventListener('error', event => showError(event.error || event.message));
window.addEventListener('unhandledrejection', event => showError(event.reason));
class PreviewBoundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <pre style={{ color: '#b34c3c', whiteSpace: 'pre-wrap' }}>{this.state.error}</pre> : this.props.children; }
}
window.renderArtifact = (mode, source) => {
  try {
    const root = document.getElementById('root'); if (!root) throw new Error('Missing preview root.');
    if (mode === 'markdown') { createRoot(root).render(<PreviewBoundary><article className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown></article></PreviewBoundary>); return; }
    const module: { exports: Record<string, unknown> } = { exports: {} };
    const require = (name: string): unknown => {
      if (name === 'react') return { ...React, default: React, __esModule: true };
      if (name === 'react-dom/client') return { createRoot };
      if (name === 'lucide-react') return Icons;
      throw new Error(`Package “${name}” is unavailable. Use react, react-dom/client, or lucide-react, and keep the artifact self-contained.`);
    };
    const execute = new Function('require', 'module', 'exports', 'React', `${source}\n;return typeof App !== 'undefined' ? App : undefined;`);
    const fallback: unknown = execute(require, module, module.exports, React);
    const component = module.exports.default || module.exports.App || fallback;
    if (typeof component !== 'function' && typeof component !== 'object') throw new Error('Export a default React component, or define a component named App.');
    createRoot(root).render(<PreviewBoundary>{React.createElement(component as React.ComponentType)}</PreviewBoundary>);
  } catch (error) { showError(error); }
};
