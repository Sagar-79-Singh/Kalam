import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { AlertCircle } from 'lucide-react';
import { APP_NAME } from './constants';
import { useApp } from './store/app';
import { applyTheme } from './lib/theme';
import { stopSpeaking } from './lib/voice';
import { Sidebar } from './components/Sidebar';
import { ChatHeader } from './components/ChatHeader';
import { ChatView } from './components/ChatView';
import { ArtifactPanel } from './components/ArtifactPanel';
import { ArtifactLibrary, NewArtifactModal } from './components/ArtifactModal';
import { SettingsModal } from './components/SettingsModal';
import { SearchModal } from './components/SearchModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { ProjectModal } from './components/ProjectModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Button } from './components/ui';

export default function App() {
  const [library, setLibrary] = useState(false);
  const [newArtifact, setNewArtifact] = useState(false);
  const search = useApp(s => s.searchOpen);
  const shortcuts = useApp(s => s.shortcutsOpen);
  const error = useApp(s => s.loadingError);
  const theme = useApp(s => s.settings.theme);
  useEffect(() => {
    document.title = APP_NAME;
    void useApp.getState().bootstrap();
    const preference = matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(useApp.getState().settings);
    preference.addEventListener('change', update);
    return () => { preference.removeEventListener('change', update); useApp.getState().stop(); stopSpeaking(); };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const state = useApp.getState();
      const target = event.target as HTMLElement;
      const editable = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      const dialog = Boolean(document.querySelector('[role="dialog"]'));
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'k') { event.preventDefault(); useApp.setState({ searchOpen: true }); return; }
      if (dialog) return;
      if (modifier && event.key.toLowerCase() === 'n') { event.preventDefault(); state.newChat(undefined, event.shiftKey); }
      else if (modifier && event.key.toLowerCase() === 'b') { event.preventDefault(); useApp.setState({ sidebarOpen: !state.sidebarOpen }); }
      else if (modifier && event.shiftKey && event.key.toLowerCase() === 'a') { event.preventDefault(); useApp.setState({ artifactOpen: !state.artifactOpen }); }
      else if (modifier && event.key === ',') { event.preventDefault(); useApp.setState({ settingsTab: 'connection' }); }
      else if (!editable && event.key === '?') { event.preventDefault(); useApp.setState({ shortcutsOpen: true }); }
      else if (event.key === 'Escape' && state.streamingChatId) { event.preventDefault(); state.stop(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return <><div className="app-shell relative flex h-[100dvh] w-full overflow-hidden bg-bg">
    <Sidebar onLibrary={() => setLibrary(true)} />
    <main className="app-main relative flex min-w-0 flex-1 flex-col"><ChatHeader onNewArtifact={() => setNewArtifact(true)} onLibrary={() => setLibrary(true)} />
      {error ? <div role="alert" className="m-auto max-w-md px-6 text-center"><AlertCircle size={30} className="mx-auto mb-4 text-accent" /><h1 className="font-display text-2xl">Your local workspace needs attention.</h1><p className="my-4 break-words text-sm leading-relaxed text-muted">{error}</p><Button onClick={() => void useApp.getState().bootstrap()}>Try loading again</Button><p className="mt-4 text-xs text-muted">Your files have not been reset or overwritten.</p></div> : <ChatView />}
    </main>
    <ArtifactPanel onNew={() => setNewArtifact(true)} />
  </div>
    <SettingsModal />{search && <SearchModal />}{shortcuts && <ShortcutsModal />}<ProjectModal />
    {library && <ArtifactLibrary onClose={() => setLibrary(false)} onNew={() => { setLibrary(false); setNewArtifact(true); }} />}
    {newArtifact && <NewArtifactModal onClose={() => setNewArtifact(false)} />}<ConfirmDialog />
    <Toaster position="bottom-center" theme={theme === 'system' ? 'system' : theme} closeButton richColors toastOptions={{ className: '!border-border !bg-panel !font-sans !text-fg', duration: 4000 }} />
  </>;
}
