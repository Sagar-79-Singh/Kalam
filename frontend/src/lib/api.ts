import type { Connector, Settings } from '../types';
import { nativeStream } from './native-stream.ts';
export function apiFetch(path: string, settings: Settings, init: RequestInit = {}, connector?: Connector): Promise<Response> {
  const bridge = window.go?.main.App;
  if (bridge && (path === 'omniroute' || path.startsWith('mcp/'))) return nativeStream(bridge, path, init);
  const headers = new Headers(init.headers);
  if (!window.go) headers.set('X-Kalam-Config', encodeURIComponent(JSON.stringify({
    baseUrl: settings.baseUrl, apiKey: settings.apiKey, apiFormat: settings.apiFormat,
    searchEndpoint: settings.searchEndpoint, searchApiKey: settings.searchApiKey, searchMethod: settings.searchMethod,
    connectorUrl: connector?.url, authHeader: connector?.authHeader, authValue: connector?.authValue
  })));
  return fetch(`/api/${path}`, { ...init, headers });
}
export function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export async function responseError(response: Response): Promise<Error> {
  const text = await response.text();
  try {
    const value: unknown = JSON.parse(text);
    if (isRecord(value)) {
      if (typeof value.error === 'string') return new Error(value.error);
      if (isRecord(value.error) && typeof value.error.message === 'string') return new Error(value.error.message);
      if (typeof value.message === 'string') return new Error(value.message);
    }
  } catch { /* Some gateways return a text error page. */ }
  return new Error(text.slice(0, 350) || `Request failed (${response.status}). Check your endpoint and credentials.`);
}
