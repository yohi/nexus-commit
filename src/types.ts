export type DiffMode = 'staged' | 'unstaged' | 'all';
export type Lang = 'ja' | 'en';

export interface Config {
  nexusUrl: string;
  llmUrl: string;
  llmModel: string;
  llmApiKey: string;
  lang: Lang;
  maxChars: number;
  nexusTimeoutMs: number;
  llmTimeoutMs: number;
  diffMode: DiffMode;
  dryRun: boolean;
  useContext: boolean;
}

export interface DiffResult {
  diff: string;
  files: string[];
}

export interface NexusSearchRequest {
  query: string;
  files: string[];
}

export interface NexusResult {
  file: string;
  content: string;
}

export interface ChatRequest {
  system: string;
  user: string;
  model: string;
}

export interface GitClient {
  isRepo(): Promise<boolean>;
  getDiff(mode: DiffMode): Promise<DiffResult>;
  commit(message: string): Promise<void>;
}

export interface NexusClientPort {
  search(req: NexusSearchRequest, opts: { timeoutMs: number }): Promise<NexusResult[]>;
}

export interface LlmClientPort {
  chat(req: ChatRequest, opts: { timeoutMs: number }): Promise<string>;
}