import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
export function IconButton({ title, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) {
  return <button type="button" title={title} aria-label={title} className={`icon-btn ${className}`} {...props}>{children}</button>;
}
export function Button({ children, className = '', primary, danger, busy, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; danger?: boolean; busy?: boolean }) {
  return <button type="button" className={`btn ${primary ? 'btn-primary' : ''} ${danger ? 'btn-danger' : ''} ${className}`} {...props}>{busy && <Loader2 size={14} className="animate-spin" />}{children}</button>;
}
export function Toggle({ value, onChange, label, disabled }: { value: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={value} aria-label={label} disabled={disabled} onClick={() => onChange(!value)} className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${value ? 'bg-accent' : 'bg-muted/30'}`}><span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${value ? 'left-0 translate-x-[19px]' : 'left-0 translate-x-[3px]'}`} /></button>;
}
export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return <div><label htmlFor={htmlFor} className="label">{label}</label>{children}{hint && <p className="hint">{hint}</p>}</div>;
}
export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border px-5 py-9 text-center"><div className="mb-3 flex justify-center text-accent/80">{icon}</div><h3 className="mb-1 font-medium">{title}</h3><div className="text-sm leading-relaxed text-muted">{children}</div></div>;
}
