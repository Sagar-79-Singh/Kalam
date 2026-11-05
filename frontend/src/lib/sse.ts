export interface SSEEvent { event: string; data: string }
/** Incremental SSE parser: CRLF, multi-line data, comments, and split UTF-8 are handled. */
export async function* readSSE(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader(); const decoder = new TextDecoder();
  let pending = ''; let event = ''; let data: string[] = [];
  function line(value: string): SSEEvent | undefined {
    if (value === '') { if (!data.length) { event = ''; return; } const result = { event: event || 'message', data: data.join('\n') }; event = ''; data = []; return result; }
    if (value.startsWith(':')) return;
    const colon = value.indexOf(':'); const field = colon < 0 ? value : value.slice(0, colon);
    let text = colon < 0 ? '' : value.slice(colon + 1); if (text.startsWith(' ')) text = text.slice(1);
    if (field === 'event') event = text; else if (field === 'data') data.push(text);
  }
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Generation stopped', 'AbortError');
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = pending.indexOf('\n')) >= 0) { const result = line(pending.slice(0, newline).replace(/\r$/, '')); pending = pending.slice(newline + 1); if (result) yield result; }
      if (done) { if (pending) { const result = line(pending.replace(/\r$/, '')); if (result) yield result; } const last = line(''); if (last) yield last; break; }
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
