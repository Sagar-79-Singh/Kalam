import type { SearchRecord, Settings } from '../types';
import { apiFetch, isRecord, responseError } from './api';
export async function webSearch(query: string, settings: Settings, signal: AbortSignal): Promise<SearchRecord> {
  const response = await apiFetch('search', settings, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  if (!response.ok) throw await responseError(response);
  const value: unknown = await response.json();
  const list: unknown[] = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.results) ? value.results : isRecord(value) && isRecord(value.web) && Array.isArray(value.web.results) ? value.web.results : [];
  const results = list.flatMap(item => {
    if (!isRecord(item)) return [];
    const url = typeof item.url === 'string' ? item.url : typeof item.link === 'string' ? item.link : '';
    if (!/^https?:\/\//i.test(url)) return [];
    return [{ title: String(item.title || url), url, snippet: String(item.snippet || item.content || item.description || '').slice(0, 4000) }];
  }).slice(0, 6);
  if (!results.length) throw new Error('The search endpoint returned no usable results. Expected a results array with title, url, and content or snippet.');
  return { query, results, status: 'complete' };
}
