import { APP_NAME } from '../constants';
export function BrandMark({ className = 'h-7 w-7' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true"><g stroke="currentColor" strokeWidth="3.7" strokeLinecap="round"><path d="M24 5v38M5 24h38M10.6 10.6l26.8 26.8M10.6 37.4l26.8-26.8" /><path d="M17 6.5l14 35M6.5 31l35-14" strokeWidth="2.4" /></g></svg>;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-2.5 text-accent"><BrandMark className="h-7 w-7" />{!compact && <span className="font-display text-[27px] tracking-[-1px] text-fg">{APP_NAME}</span>}</div>;
}
