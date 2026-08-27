// Spec 014 (v0.6.4) AGX-009 — multi-agent surface adapter contract.
// Interface-only by design (D-log): codex ships the only implementation in
// v0.6.4; claude/opencode adapters arrive in a follow-up spec.
import type { CodexEvent } from './codexEvents';

export interface AgentLaunchOptions {
  rootId?: string;
  cwdPath?: string;
  envId?: string;
  model?: string;
  sandbox?: 'read-only' | 'workspace-write';
}

export interface AgentSessionHandle {
  id: string;
  close(): void;
}

export type AgentEventSink = (event: CodexEvent) => void;

export interface AgentSurfaceAdapter {
  startSession(opts: AgentLaunchOptions): AgentSessionHandle;
  feed(chunk: Uint8Array | string): void;
  onEvent(sink: AgentEventSink): () => void;
}
