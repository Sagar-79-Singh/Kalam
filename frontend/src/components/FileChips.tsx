import { FileText, X } from 'lucide-react';
import type { Attachment } from '../types';
import { humanSize } from '../lib/utils';

export function FileChips({ files, onRemove }: { files: Attachment[]; onRemove?: (id: string) => void }) {
  return <div className="flex flex-wrap gap-2">{files.map(file => <div key={file.id} className="flex max-w-full items-center gap-2 rounded-lg border border-border bg-panel px-2.5 py-2 text-xs">
    {file.dataUrl ? <img src={file.dataUrl} alt="" className="h-9 w-9 rounded object-cover" /> : <span className="rounded bg-accent/10 p-2 text-accent"><FileText size={16} /></span>}
    <span className="min-w-0"><span className="block max-w-44 truncate">{file.name}</span><span className="mt-0.5 block text-[10px] text-muted">{humanSize(file.size)}{file.text ? ' · text extracted' : ''}</span></span>
    {onRemove && <button type="button" aria-label={`Remove ${file.name}`} onClick={() => onRemove(file.id)} className="ml-1 rounded p-1 text-muted hover:bg-surface hover:text-fg"><X size={13} /></button>}
  </div>)}</div>;
}
