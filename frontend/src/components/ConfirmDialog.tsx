import { useState } from 'react';
import { toast } from 'sonner';
import { useApp } from '../store/app';
import { errorMessage } from '../lib/utils';
import { Modal } from './Modal';
import { Button } from './ui';

export function ConfirmDialog() {
  const confirm = useApp(s => s.confirm);
  const [busy, setBusy] = useState(false);
  if (!confirm) return null;
  const close = () => { if (!busy) useApp.setState({ confirm: null }); };
  const run = async () => {
    setBusy(true);
    try { await confirm.action(); useApp.setState({ confirm: null }); }
    catch (error) { toast.error('That action could not be completed', { description: errorMessage(error) }); }
    finally { setBusy(false); }
  };
  return <Modal title={confirm.title} onClose={close} top><div className="p-5"><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">{confirm.description}</p><div className="mt-6 flex justify-end gap-2"><Button disabled={busy} onClick={close}>Cancel</Button><Button primary={!confirm.destructive} danger={confirm.destructive} disabled={busy} busy={busy} onClick={() => void run()}>Confirm</Button></div></div></Modal>;
}
