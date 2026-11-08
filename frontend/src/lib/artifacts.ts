import type { Artifact, ArtifactType } from '../types.ts';
export interface ParsedArtifact { id: string; type: ArtifactType; title: string; code: string; complete: boolean; index: number }
export interface ParsedTool { id: string; name: string; arguments: Record<string, unknown>; error?: string }
export interface ParsedOutput { text: string; artifacts: ParsedArtifact[]; memories: string[]; tools: ParsedTool[]; skills: string[] }
const tags = ['artifact', 'memory', 'tool_call', 'load_skill'];
const types: ArtifactType[] = ['html', 'react', 'svg', 'mermaid', 'markdown'];
function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) result[match[1]] = (match[2] ?? match[3]).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return result;
}
function trimPartialClose(content: string, closing: string): string {
  for (let n = closing.length - 1; n > 0; n--) if (content.endsWith(closing.slice(0, n))) return content.slice(0, -n);
  return content;
}
/** Removes control tags without leaking half-written tags into streaming Markdown. */
export function parseModelOutput(raw: string, final = false): ParsedOutput {
  const output: ParsedOutput = { text: '', artifacts: [], memories: [], tools: [], skills: [] };
  let position = 0; let fence: string | null = null;
  while (position < raw.length) {
    if ((position === 0 || raw[position - 1] === '\n') && (raw.startsWith('```', position) || raw.startsWith('~~~', position))) {
      const marker = raw.slice(position, position + 3); fence = fence === marker ? null : fence ?? marker;
      const end = raw.indexOf('\n', position); if (end < 0) { output.text += raw.slice(position); break; }
      output.text += raw.slice(position, end + 1); position = end + 1; continue;
    }
    // Examples in inline code must never invoke memory, skills, or tools.
    if (!fence && raw[position] === '`') {
      const run = /^`+/.exec(raw.slice(position))?.[0] ?? '`';
      const end = raw.indexOf(run, position + run.length);
      if (end < 0) { output.text += raw.slice(position); break; }
      output.text += raw.slice(position, end + run.length); position = end + run.length; continue;
    }
    if (raw[position] !== '<' || fence) { output.text += raw[position++]; continue; }
    const rest = raw.slice(position);
    const tag = tags.find(name => new RegExp(`^<${name}(?:\\s|>|/)`).test(rest));
    if (!tag) {
      if (tags.some(name => `<${name}`.startsWith(rest)) && (!final || rest.length >= 4)) break;
      output.text += raw[position++]; continue;
    }
    const openEnd = raw.indexOf('>', position);
    if (openEnd < 0) break;
    const open = raw.slice(position, openEnd + 1); const attrs = attributes(open);
    const closing = `</${tag}>`; const selfClosing = /\/\s*>$/.test(open);
    const closeAt = selfClosing ? openEnd + 1 : raw.indexOf(closing, openEnd + 1);
    const complete = closeAt >= 0;
    const body = selfClosing ? '' : complete ? raw.slice(openEnd + 1, closeAt) : trimPartialClose(raw.slice(openEnd + 1), closing);
    if (tag === 'artifact') {
      const type = types.includes(attrs.type as ArtifactType) ? attrs.type as ArtifactType : 'html';
      output.artifacts.push({ id: attrs.id || '', type, title: attrs.title || 'Untitled artifact', code: body.replace(/^\r?\n/, '').replace(/\r?\n$/, ''), complete, index: output.artifacts.length });
    } else if (complete && tag === 'memory' && body.trim()) output.memories.push(body.trim());
    else if (complete && tag === 'load_skill') { const name = attrs.name || body.trim(); if (name) output.skills.push(name); }
    else if (complete && tag === 'tool_call') {
      let args: Record<string, unknown> = {}; let error: string | undefined;
      try { const value: unknown = JSON.parse(body || '{}'); if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(); args = value as Record<string, unknown>; }
      catch { error = 'The model provided invalid JSON arguments. Ask it to retry this tool.'; }
      output.tools.push({ id: attrs.id || `tag-tool-${output.tools.length}`, name: attrs.name || '', arguments: args, error });
    }
    if (!complete) break;
    position = selfClosing ? openEnd + 1 : closeAt + closing.length;
  }
  output.text = output.text.trim();
  return output;
}
export function updateArtifacts(current: Artifact[], parsed: ParsedArtifact[], chatId: string, messageId: string, now = Date.now()): Artifact[] {
  const result = current.map(artifact => ({ ...artifact, versions: artifact.versions.map(version => ({ ...version })) }));
  for (const item of parsed) {
    const id = item.id || `artifact-${messageId}-${item.index}`;
    const versionId = `${messageId}:${item.index}`;
    let artifact = result.find(a => a.id === id);
    if (!artifact) { artifact = { id, chatId, title: item.title, type: item.type, versions: [], activeVersionId: versionId }; result.push(artifact); }
    artifact.title = item.title; artifact.type = item.type;
    const version = artifact.versions.find(v => v.id === versionId);
    if (version) version.code = item.code;
    else artifact.versions.push({ id: versionId, number: artifact.versions.length + 1, code: item.code, createdAt: now, messageId });
    artifact.activeVersionId = versionId;
  }
  return result;
}
