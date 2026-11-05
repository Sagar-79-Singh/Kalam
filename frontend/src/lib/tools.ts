import type { Chat, Connector, Settings, Skill, ToolDefinition } from '../types';
export interface ToolRoute { definition: ToolDefinition; kind: 'connector' | 'skill' | 'memory'; connector?: Connector; originalName: string }
export function toolRegistry(settings: Settings, chat: Chat | undefined, connectors: Connector[], skills: Skill[]): Map<string, ToolRoute> {
  const registry = new Map<string, ToolRoute>();
  if (skills.some(s => s.enabled)) registry.set('load_skill', { kind: 'skill', originalName: 'load_skill', definition: { name: 'load_skill', description: 'Load the full instructions of a relevant skill by its name. Only load a skill when the task matches its description.', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false } } });
  if (settings.memoryEnabled && !chat?.incognito) registry.set('save_memory', { kind: 'memory', originalName: 'save_memory', definition: { name: 'save_memory', description: 'Save a useful fact about the user for future conversations. Never save passwords, secrets, or guesses.', inputSchema: { type: 'object', properties: { fact: { type: 'string' } }, required: ['fact'], additionalProperties: false } } });
  for (const connector of connectors.filter(c => c.enabled && (chat ? chat.connectorIds.includes(c.id) : true))) {
    for (const [index, tool] of connector.tools.entries()) {
      const name = `mcp_${connector.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}_${index}_${tool.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30)}`;
      registry.set(name, { kind: 'connector', connector, originalName: tool.name, definition: { ...tool, name, description: `${connector.name}: ${tool.description || tool.name}` } });
    }
  }
  return registry;
}
