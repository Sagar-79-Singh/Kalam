import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, GitBranch, LockKeyhole, Play } from 'lucide-react';
import { APP_NAME } from '../constants';
import { useApp } from '../store/app';
import { continueConversation } from '../lib/conversation';
import { Composer } from './Composer';
import { MessageBubble } from './MessageBubble';
import { Welcome } from './Welcome';
import { Button } from './ui';

export function ChatView() {
  const chatId = useApp(s => s.activeChatId);
  const chat = useApp(s => s.chats.find(c => c.id === chatId));
  const streamingId = useApp(s => s.streamingMessageId);
  const streamingChat = useApp(s => s.streamingChatId);
  const ready = useApp(s => s.ready);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [jump, setJump] = useState(false);
  const latest = () => { const element = scroller.current; following.current = true; setJump(false); if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' }); };
  useLayoutEffect(() => {
    following.current = true; setJump(false);
    const element = scroller.current; if (element) element.scrollTop = element.scrollHeight;
  }, [chatId]);
  useEffect(() => {
    const element = scroller.current; const body = content.current;
    if (!element || !body) return;
    const observer = new ResizeObserver(() => {
      if (following.current) element.scrollTop = element.scrollHeight;
      else setJump(element.scrollHeight - element.scrollTop - element.clientHeight > 80);
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, [chatId, Boolean(chat)]);
  if (!ready) return <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-5 px-10 pb-32"><div className="mx-auto mb-5 h-12 w-12 animate-pulse rounded-full bg-fg/5" /><div className="mx-auto h-10 w-3/4 animate-pulse rounded-xl bg-fg/5" /><div className="mt-4 h-40 animate-pulse rounded-2xl bg-fg/5" /><div className="grid grid-cols-4 gap-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-fg/5" />)}</div></div>;
  if (!chat || !chat.messages.length) return <Welcome />;
  return <div className="relative flex min-h-0 flex-1 flex-col">
    <div ref={scroller} className="chat-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain" onWheel={event => { if (event.deltaY < 0) { following.current = false; setJump(true); } }} onScroll={() => { const element = scroller.current; if (!element) return; const near = element.scrollHeight - element.scrollTop - element.clientHeight < 80; following.current = near; setJump(!near); }}>
      <div ref={content} className="print-chat mx-auto max-w-[800px] px-5 pb-6 pt-8 sm:px-8"><h1 className="print-title hidden">{chat.title}</h1>
        {chat.incognito && <p className="no-print mb-8 flex items-center justify-center gap-1.5 text-[10px] text-muted"><LockKeyhole size={11} />This conversation is not saved on this device.</p>}
        {chat.branchedFrom && <p className="no-print mb-8 flex items-center justify-center gap-1.5 text-[10px] text-muted"><GitBranch size={11} />A new direction, with the original conversation kept intact.</p>}
        {chat.messages.map(message => <MessageBubble key={message.id} message={message} chatId={chat.id} streaming={message.id === streamingId && chat.id === streamingChat} />)}
        {!streamingChat && chat.messages.at(-1)?.role === 'user' && <div className="no-print flex justify-center"><Button onClick={() => void continueConversation()}><Play size={13} />Continue from here</Button></div>}
      </div>
    </div>
    <div className="no-print pointer-events-none relative z-10 h-0">{jump && <button onClick={latest} className="pointer-events-auto absolute -top-12 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-panel px-3.5 py-2 text-[11px] text-muted shadow-md transition-colors hover:text-fg"><ArrowDown size={13} />Jump to latest</button>}</div>
    <div className="no-print shrink-0 bg-bg px-4 pb-3 pt-2 sm:px-8"><Composer /><p className="mt-3 text-center text-[10px] text-muted/60">{APP_NAME} can make mistakes. A little double-checking goes a long way.</p></div>
  </div>;
}
