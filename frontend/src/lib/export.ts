import { APP_NAME, APP_VERSION } from '../constants';
import type { Chat } from '../types';
import { parseModelOutput } from './artifacts';
import { downloadFile, safeFilename } from './utils';

export function chatMarkdown(chat: Chat): string {
  const sections = [`# ${chat.title}`, `Exported from ${APP_NAME} · ${new Date().toLocaleDateString()}`];
  for (const message of chat.messages.filter(m => m.role !== 'tool')) {
    sections.push(`## ${message.role === 'user' ? 'You' : APP_NAME}\n\n${message.role === 'assistant' ? parseModelOutput(message.content, true).text : message.content}`);
    if (message.attachments.length) sections.push(`Attachments: ${message.attachments.map(file => file.name).join(', ')}`);
    if (message.search) sections.push(`Search: ${message.search.query}\n\n${message.search.results.map(result => `- [${result.title}](${result.url})`).join('\n')}`);
    for (const tool of message.toolCalls ?? []) sections.push(`<details><summary>Tool: ${tool.name}</summary>\n\n${tool.error ? `Error: ${tool.error}` : tool.result || tool.status}\n\n</details>`);
    if (message.error) sections.push(`> Error: ${message.error}`);
  }
  if (chat.artifacts.length) {
    sections.push('---\n\n# Artifacts');
    for (const artifact of chat.artifacts) {
      const version = artifact.versions.find(v => v.id === artifact.activeVersionId) ?? artifact.versions.at(-1);
      if (!version) continue;
      const fence = '`'.repeat(Math.max(3, ...Array.from(version.code.matchAll(/`+/g), match => match[0].length + 1)));
      sections.push(`## ${artifact.title} · v${version.number}\n\n${fence}${artifact.type === 'react' ? 'jsx' : artifact.type}\n${version.code}\n${fence}`);
    }
  }
  return sections.join('\n\n') + '\n';
}
export async function exportChat(chat: Chat, format: 'md' | 'json' | 'pdf'): Promise<void> {
  if (format === 'pdf') { window.print(); return; }
  await downloadFile(`${safeFilename(chat.title)}.${format}`, format === 'md' ? chatMarkdown(chat) : JSON.stringify({ app: APP_NAME, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), chat }, null, 2), format === 'md' ? 'text/markdown' : 'application/json');
}
