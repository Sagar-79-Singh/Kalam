import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './ui';
interface Props { title: string; children: ReactNode; onClose: () => void; className?: string; hideHeader?: boolean; top?: boolean }
export function Modal({ title, children, onClose, className = 'max-w-lg', hideHeader = false, top = false }: Props) {
  const ref = useRef<HTMLDivElement>(null); const close = useRef(onClose); close.current = onClose; const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current;
    const focusable = () => Array.from(element?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
    (element?.querySelector<HTMLElement>('[data-autofocus]') ?? focusable()[0] ?? element)?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key === 'Tab') { const nodes = focusable(); const first = nodes[0]; const last = nodes.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    };
    element?.addEventListener('keydown', key);
    return () => { element?.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className={`no-print fixed inset-0 flex items-center justify-center bg-black/25 p-3 backdrop-blur-[3px] sm:p-6 ${top ? 'z-[100]' : 'z-[70]'}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={ref} role="dialog" aria-modal="true" aria-label={hideHeader ? title : undefined} aria-labelledby={hideHeader ? undefined : id} tabIndex={-1} className={`flex max-h-[90dvh] w-full animate-fade-up flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl ${className}`}>
    {!hideHeader && <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4"><h2 id={id} className="font-display text-xl">{title}</h2><IconButton title="Close dialog" onClick={onClose}><X size={18} /></IconButton></div>}{children}
  </div></div>;
}
