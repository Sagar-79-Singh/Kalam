import type { Settings, Skill } from '../types';

export const defaultSettings: Settings = {
  initialized: false, baseUrl: '', apiKey: '', model: '', apiFormat: 'auto',
  toolMode: 'tags', maxTokens: 8192, name: 'Sagar', about: '', customInstructions: '',
  responseStyle: 'normal', theme: 'system', font: 'inter', fontSize: 16,
  readAloud: false, searchEndpoint: '', searchApiKey: '', searchMethod: 'GET', memoryEnabled: true
};
export const sampleSkills: Skill[] = [
  {
    id: 'skill-clear-writing', name: 'Clear writing', enabled: true,
    description: 'Draft, edit, and refine writing while preserving the author’s voice.',
    instructions: '# Clear writing\n\nWhen asked to write or edit, first identify the reader and purpose. Prefer concrete words, active voice, and short paragraphs. Preserve the user’s voice. Remove filler, explain substantive edits, and offer a ready-to-use final draft. Ask a clarifying question only if essential.'
  },
  {
    id: 'skill-artifact-studio', name: 'Artifact studio', enabled: true,
    description: 'Build polished, self-contained interactive prototypes and visual explanations.',
    instructions: '# Artifact studio\n\nCreate self-contained artifacts. Prioritize accessible contrast, responsive layouts, and keyboard interaction. Use inline CSS and JavaScript for HTML artifacts. React artifacts can import react and lucide-react, and must export a default component. No external dependencies or network calls are available. Use SVG for illustrations and Mermaid for diagrams. Reuse an artifact’s id for updates and return its complete updated source.'
  },
  {
    id: 'skill-thought-partner', name: 'Thought partner', enabled: false,
    description: 'Break down difficult decisions and compare options with explicit trade-offs.',
    instructions: '# Thought partner\n\nSeparate facts, assumptions, and unknowns. Identify the goal, constraints, and available options. Compare trade-offs, challenge weak assumptions respectfully, and end with a concrete next step. Avoid false certainty.'
  }
];
