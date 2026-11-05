import { toast } from 'sonner';
import type { Attachment, Chat, Message, ToolCall } from '../types';
import { activeChat, createDraftChat, useApp } from '../store/app';
import { chatTitle, errorMessage, uid } from './utils';
import { parseModelOutput, updateArtifacts } from './artifacts';
import { sendMessage } from './omniroute';
import { buildSystemPrompt } from './prompt';
import { toolRegistry } from './tools';
import { callConnector, testConnector } from './connectors';
import { webSearch } from './search';
import { speak } from './voice';

function update(chatId: string, action: (chat: Chat) => Chat): Chat | undefined {
  const chat = useApp.getState().chats.find(c => c.id === chatId); if (!chat) return;
  const result = action(chat); useApp.getState().updateChat(result, false); return result;
}
function updateMessage(chatId: string, id: string, patch: Partial<Message>): void {
  update(chatId, chat => ({ ...chat, updatedAt: Date.now(), messages: chat.messages.map(m => m.id === id ? { ...m, ...patch } : m) }));
}
async function remember(fact: string, chat: Chat): Promise<string> {
  const state = useApp.getState();
  if (!state.settings.memoryEnabled || chat.incognito) return 'Memory saving is disabled.';
  const content = fact.trim().slice(0, 2000); if (!content) throw new Error('A non-empty fact is required.');
  if (state.memories.some(m => m.content.toLocaleLowerCase() === content.toLocaleLowerCase())) return 'This fact is already saved.';
  await state.saveMemory({ id: uid(), content, createdAt: Date.now() }); toast.success('Memory saved', { description: content.slice(0, 100) }); return 'Memory saved.';
}
function trimFrom(chat: Chat, position: number): Chat {
  const messages = chat.messages.slice(0, position); const kept = new Set(messages.map(m => m.id));
  return { ...chat, messages, artifacts: chat.artifacts.flatMap(a => { const versions = a.versions.filter(v => !v.messageId || kept.has(v.messageId)).map((v, index) => ({ ...v, number: index + 1 })); return versions.length ? [{ ...a, versions, activeVersionId: versions.at(-1)!.id }] : []; }) };
}
export async function sendUserMessage(content: string, attachments: Attachment[] = [], editMessageId?: string): Promise<void> {
  const state = useApp.getState(); if (state.streamingChatId || (!content.trim() && !attachments.length)) return;
  let chat = activeChat() ?? createDraftChat();
  if (editMessageId) { const index = chat.messages.findIndex(m => m.id === editMessageId); if (index >= 0) chat = trimFrom(chat, index); }
  const firstMessage = chat.messages.length === 0;
  chat = { ...chat, model: state.settings.model, updatedAt: Date.now(), title: firstMessage ? chatTitle(content || attachments[0]?.name || '') : chat.title, messages: [...chat.messages, { id: uid(), role: 'user', content: content.trim(), attachments, createdAt: Date.now() }] };
  state.updateChat(chat); useApp.setState({ activeChatId: chat.id, promptDraft: '' });
  await generate(chat.id);
}
export async function regenerateMessage(id: string): Promise<void> {
  if (useApp.getState().streamingChatId) return;
  const chat = activeChat(); if (!chat) return;
  const index = chat.messages.findIndex(m => m.id === id); if (index < 0) return;
  const position = chat.messages.slice(0, index + 1).findLastIndex(m => m.role === 'user'); if (position < 0) return;
  useApp.getState().updateChat(trimFrom(chat, position + 1)); await generate(chat.id);
}
export async function continueConversation(): Promise<void> {
  const state = useApp.getState();
  if (state.streamingChatId || !state.activeChatId) return;
  await generate(state.activeChatId);
}
async function generate(chatId: string): Promise<void> {
  const controller = new AbortController();
  useApp.setState({ abortController: controller, streamingChatId: chatId });
  let currentMessageId = ''; let lastText = ''; let frame = 0; let flush: (() => void) | undefined;
  const opened = new Set<string>();
  try {
    const initial = useApp.getState();
    // Discover tools on first use, rather than sending an empty tool catalogue.
    const chatAtStart = initial.chats.find(c => c.id === chatId); if (!chatAtStart) return;
    for (const connector of initial.connectors.filter(c => c.enabled && chatAtStart.connectorIds.includes(c.id) && !c.lastTested)) {
      try { const tools = await testConnector(connector, initial.settings, controller.signal); await useApp.getState().saveConnector({ ...connector, tools, lastTested: Date.now() }); }
      catch (error) { if (controller.signal.aborted) throw error; toast.error(`${connector.name}: connection failed`, { description: errorMessage(error) }); }
    }
    let search: Message['search'];
    for (let round = 0; round < 8; round++) {
      if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError');
      const state = useApp.getState(); const chat = state.chats.find(c => c.id === chatId); if (!chat) return;
      const message: Message = { id: uid(), role: 'assistant', content: '', attachments: [], createdAt: Date.now() };
      currentMessageId = message.id; useApp.setState({ streamingMessageId: message.id });
      update(chatId, c => ({ ...c, messages: [...c.messages, message] }));
      if (round === 0 && chat.webSearch) {
        const query = chat.messages.findLast(m => m.role === 'user')?.content.slice(0, 1000) || 'Attached document';
        search = { query, results: [], status: 'running' }; updateMessage(chatId, message.id, { search });
        try { search = await webSearch(query, state.settings, controller.signal); }
        catch (error) { if (controller.signal.aborted) throw error; search = { query, results: [], status: 'error', error: errorMessage(error) }; }
        updateMessage(chatId, message.id, { search });
      }
      const project = state.projects.find(p => p.id === chat.projectId);
      const system = buildSystemPrompt({ ...state, chat, project, search });
      useApp.setState({ lastSystemPrompt: system });
      const registry = toolRegistry(state.settings, chat, state.connectors, state.skills);
      let raw = '';
      flush = () => {
        frame = 0; const parsed = parseModelOutput(raw);
        update(chatId, c => ({ ...c, messages: c.messages.map(m => m.id === message.id ? { ...m, content: raw } : m), artifacts: updateArtifacts(c.artifacts, parsed.artifacts, c.id, message.id) }));
        if (parsed.artifacts.length) {
          const artifactId = parsed.artifacts[0].id || `artifact-${message.id}-0`;
          if (!opened.has(artifactId) && useApp.getState().activeChatId === chatId) { opened.add(artifactId); useApp.setState({ artifactOpen: true, selectedArtifactId: artifactId }); }
        }
      };
      const settings = { ...state.settings, model: chat.model || state.settings.model };
      const messages = [...chat.messages];
      // Project images use the same vision input path as chat attachments.
      if (project?.files.some(f => f.dataUrl)) {
        const lastUser = messages.findLastIndex(m => m.role === 'user');
        if (lastUser >= 0) messages[lastUser] = { ...messages[lastUser], attachments: [...messages[lastUser].attachments, ...project.files.filter(f => f.dataUrl)] };
      }
      const result = await sendMessage({ settings, messages, system, tools: [...registry.values()].map(t => t.definition), signal: controller.signal,
        onText(chunk) { raw += chunk; if (!frame) frame = requestAnimationFrame(() => flush?.()); }
      });
      if (frame) { cancelAnimationFrame(frame); frame = 0; } flush();
      const parsed = parseModelOutput(result.content, true); lastText = parsed.text;
      for (const fact of parsed.memories) await remember(fact, chat);
      const requested = [
        ...result.toolCalls.map(call => ({ ...call, native: true, error: undefined as string | undefined })),
        ...parsed.tools.map(call => ({ ...call, id: `${message.id}:${call.id}`, native: false })),
        ...parsed.skills.map((name, i) => ({ id: `${message.id}:skill:${i}`, name: 'load_skill', arguments: { name } as Record<string, unknown>, native: false, error: undefined as string | undefined }))
      ];
      if (!requested.length) break;
      const calls: ToolCall[] = requested.map(call => {
        const route = registry.get(call.name) ?? [...registry.values()].find(t => t.originalName === call.name);
        return { ...call, kind: route?.kind ?? 'connector', connectorId: route?.connector?.id, status: 'pending' };
      });
      const syncCalls = () => updateMessage(chatId, message.id, { toolCalls: calls.map(call => ({ ...call })) }); syncCalls();
      for (const call of calls) {
        if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError');
        call.status = 'running'; syncCalls();
        try {
          if (call.error) throw new Error(call.error);
          const route = registry.get(call.name) ?? [...registry.values()].find(t => t.originalName === call.name);
          if (!route) throw new Error(`Tool “${call.name}” is not enabled for this chat.`);
          if (route.kind === 'skill') {
            const name = String(call.arguments.name || ''); const skill = state.skills.find(s => s.enabled && (s.name.toLowerCase() === name.toLowerCase() || s.id === name));
            if (!skill) throw new Error('The requested skill is not enabled or does not exist.');
            call.result = `Skill: ${skill.name}\n\n${skill.instructions}`;
          } else if (route.kind === 'memory') call.result = await remember(String(call.arguments.fact || ''), chat);
          else if (route.connector) call.result = await callConnector(route.connector, settings, route.originalName, call.arguments, controller.signal);
          call.status = 'complete';
        } catch (error) { if (controller.signal.aborted) throw error; call.error = errorMessage(error); call.status = 'error'; }
        syncCalls();
        const toolMessage: Message = { id: uid(), role: 'tool', content: `Tool: ${call.name}\n${call.error ? `Error: ${call.error}` : call.result || 'Done.'}`, toolCallId: call.id, createdAt: Date.now(), attachments: [] };
        update(chatId, c => ({ ...c, messages: [...c.messages, toolMessage] }));
      }
      await useApp.getState().saveChat(chatId);
      if (round === 7) updateMessage(chatId, message.id, { error: 'Tool iteration limit reached (8 rounds). Send a message to continue.' });
    }
    if (useApp.getState().settings.readAloud && lastText && !controller.signal.aborted) speak(lastText);
  } catch (error) {
    if (frame) { cancelAnimationFrame(frame); frame = 0; } flush?.();
    if (!currentMessageId) {
      currentMessageId = uid(); update(chatId, c => ({ ...c, messages: [...c.messages, { id: currentMessageId, role: 'assistant', content: '', attachments: [], createdAt: Date.now() }] }));
    }
    if (controller.signal.aborted) updateMessage(chatId, currentMessageId, { stopped: true });
    else { updateMessage(chatId, currentMessageId, { error: errorMessage(error) }); toast.error('Response interrupted', { description: errorMessage(error) }); }
    const chat = useApp.getState().chats.find(c => c.id === chatId);
    if (chat) for (const message of chat.messages) if (message.toolCalls?.some(t => t.status === 'running' || t.status === 'pending')) updateMessage(chatId, message.id, { toolCalls: message.toolCalls.map(t => t.status === 'running' || t.status === 'pending' ? { ...t, status: 'error', error: 'Stopped before completion.' } : t) });
  } finally {
    if (frame) cancelAnimationFrame(frame);
    useApp.setState({ abortController: null, streamingChatId: null, streamingMessageId: null });
    await useApp.getState().saveChat(chatId);
  }
}
