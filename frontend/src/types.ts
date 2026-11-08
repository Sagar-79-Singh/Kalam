export type Theme = 'light' | 'dark' | 'system';
export type Font = 'inter' | 'serif' | 'mono' | 'dyslexic';
export type ResponseStyle = 'normal' | 'concise' | 'explanatory' | 'casual';
export type ArtifactType = 'html' | 'react' | 'svg' | 'mermaid' | 'markdown';
export type ToolStatus = 'pending' | 'running' | 'complete' | 'error';

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  dataUrl?: string;
  text?: string;
}
export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  kind: 'connector' | 'skill' | 'memory';
  connectorId?: string;
  native?: boolean;
  status: ToolStatus;
  result?: string;
  error?: string;
}
export interface SearchResult { title: string; url: string; snippet: string }
export interface SearchRecord {
  query: string;
  results: SearchResult[];
  status: 'running' | 'complete' | 'error';
  error?: string;
}
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  createdAt: number;
  attachments: Attachment[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
  search?: SearchRecord;
  error?: string;
  stopped?: boolean;
}
export interface ArtifactVersion {
  id: string;
  number: number;
  code: string;
  createdAt: number;
  messageId?: string;
}
export interface Artifact {
  id: string;
  chatId: string;
  title: string;
  type: ArtifactType;
  versions: ArtifactVersion[];
  activeVersionId: string;
}
export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  artifacts: Artifact[];
  projectId?: string;
  incognito: boolean;
  webSearch: boolean;
  connectorIds: string[];
  model: string;
  branchedFrom?: string;
}
export interface Connector {
  id: string;
  name: string;
  url: string;
  authHeader: string;
  authValue: string;
  enabled: boolean;
  tools: ToolDefinition[];
  lastTested?: number;
}
export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
}
export interface Memory { id: string; content: string; createdAt: number }
export interface Project {
  id: string;
  name: string;
  icon: string;
  description: string;
  instructions: string;
  files: Attachment[];
  createdAt: number;
}
export interface Settings {
  initialized: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  apiFormat: 'auto' | 'messages' | 'chat';
  toolMode: 'tags' | 'native';
  maxTokens: number;
  name: string;
  about: string;
  customInstructions: string;
  responseStyle: ResponseStyle;
  theme: Theme;
  font: Font;
  fontSize: number;
  readAloud: boolean;
  searchEndpoint: string;
  searchApiKey: string;
  searchMethod: 'GET' | 'POST';
  memoryEnabled: boolean;
}
export interface Backup {
  version: number;
  app: string;
  exportedAt: string;
  settings: Settings;
  chats: Chat[];
  connectors: Connector[];
  skills: Skill[];
  memories: Memory[];
  projects: Project[];
}
export interface NativeBridge {
  StartOmniRouteStream(id: string, payload: string, format: string): Promise<void>;
  StartMCPRequest(id: string, connectorId: string, payload: string, sessionId: string, protocol: string): Promise<void>;
  CancelRequest(id: string): Promise<void>;
  GetSettings(): Promise<string>;
  PutSettings(value: string): Promise<void>;
  GetChats(): Promise<string>;
  PutChat(value: string): Promise<void>;
  DeleteChat(id: string): Promise<void>;
  GetSkills(): Promise<string>;
  PutSkill(value: string): Promise<void>;
  DeleteSkill(id: string): Promise<void>;
  GetMemories(): Promise<string>;
  PutMemory(value: string): Promise<void>;
  DeleteMemory(id: string): Promise<void>;
  GetConnectors(): Promise<string>;
  PutConnector(value: string): Promise<void>;
  DeleteConnector(id: string): Promise<void>;
  GetProjects(): Promise<string>;
  PutProject(value: string): Promise<void>;
  DeleteProject(id: string): Promise<void>;
  RestoreBackup(value: string): Promise<void>;
  OpenExternal(url: string): Promise<void>;
  SaveExport(name: string, content: string): Promise<boolean>;
}
export interface SpeechRecognitionResultLike { isFinal: boolean; 0: { transcript: string } }
export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<SpeechRecognitionResultLike>; resultIndex: number }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
declare global {
  interface Window {
    go?: { main: { App: NativeBridge } };
    runtime?: {
      EventsOnMultiple(name: string, callback: (...data: unknown[]) => void, count: number): () => void;
      EventsOff(name: string): void;
    };
    __KALAM_BOOTSTRAP__?: Partial<Settings> | null;
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}
