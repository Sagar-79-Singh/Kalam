import type { Connector, Settings, ToolDefinition } from '../types';
import { apiFetch, isRecord, responseError } from './api';
import { readSSE } from './sse';
const sessions = new Map<string, { id?: string; protocol: string }>();
let requestId = 0;
async function rpc(connector: Connector, settings: Settings, method: string, params: object, signal?: AbortSignal, notify = false): Promise<unknown> {
  const session = sessions.get(connector.id);
  const id = ++requestId;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (session?.id) headers['Mcp-Session-Id'] = session.id;
  if (session) headers['Mcp-Protocol-Version'] = session.protocol;
  const response = await apiFetch(`mcp/${encodeURIComponent(connector.id)}`, settings, { method: 'POST', headers, signal, body: JSON.stringify({ jsonrpc: '2.0', ...(notify ? {} : { id }), method, params }) }, connector);
  if (!response.ok) throw await responseError(response);
  const sessionId = response.headers.get('Mcp-Session-Id');
  if (sessionId) sessions.set(connector.id, { id: sessionId, protocol: session?.protocol || '2024-11-05' });
  if (notify || response.status === 202 || response.status === 204) return undefined;
  let value: unknown;
  if (response.headers.get('content-type')?.includes('text/event-stream') && response.body) {
    for await (const event of readSSE(response.body, signal)) { try { const parsed: unknown = JSON.parse(event.data); if (isRecord(parsed) && parsed.id === id) { value = parsed; break; } } catch { /* Ignore unrelated server notifications. */ } }
  } else value = await response.json();
  if (!isRecord(value)) throw new Error('The MCP server did not return a JSON-RPC response. Use a Streamable HTTP MCP URL.');
  if (value.error) throw new Error(isRecord(value.error) ? String(value.error.message || 'MCP request failed') : String(value.error));
  return value.result;
}
async function connect(connector: Connector, settings: Settings, signal?: AbortSignal): Promise<void> {
  if (sessions.has(connector.id)) return;
  const result = await rpc(connector, settings, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'personal-desktop', version: '1.0.0' } }, signal);
  const current = sessions.get(connector.id);
  sessions.set(connector.id, { id: current?.id, protocol: isRecord(result) && typeof result.protocolVersion === 'string' ? result.protocolVersion : '2024-11-05' });
  await rpc(connector, settings, 'notifications/initialized', {}, signal, true);
}
export async function testConnector(connector: Connector, settings: Settings, signal?: AbortSignal): Promise<ToolDefinition[]> {
  sessions.delete(connector.id);
  await connect(connector, settings, signal);
  const tools: ToolDefinition[] = []; let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const result = await rpc(connector, settings, 'tools/list', cursor ? { cursor } : {}, signal);
    if (!isRecord(result) || !Array.isArray(result.tools)) throw new Error('The MCP server returned no tools list.');
    for (const item of result.tools) if (isRecord(item) && typeof item.name === 'string') tools.push({ name: item.name, description: typeof item.description === 'string' ? item.description : '', inputSchema: isRecord(item.inputSchema) ? item.inputSchema : { type: 'object', properties: {} } });
    cursor = typeof result.nextCursor === 'string' ? result.nextCursor : undefined;
    if (!cursor) break;
  }
  return tools;
}
export async function callConnector(connector: Connector, settings: Settings, name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<string> {
  await connect(connector, settings, signal);
  const result = await rpc(connector, settings, 'tools/call', { name, arguments: args }, signal);
  if (!isRecord(result)) return JSON.stringify(result);
  const content = Array.isArray(result.content) ? result.content.map(item => isRecord(item) && typeof item.text === 'string' ? item.text : JSON.stringify(item)).join('\n') : JSON.stringify(result);
  if (result.isError) throw new Error(content || 'The tool reported an error.');
  return content.slice(0, 150_000);
}
