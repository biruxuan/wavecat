export interface ConnectionConfig {
  url: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  subprotocol: string;
}

export interface Frame {
  id: number;
  timestamp: number;
  direction: "in" | "out" | "system";
  type: string;
  size: number;
  summary: string;
  text?: string;
  base64?: string;
  hex?: string;
  ascii?: string;
  error?: string;
}

export interface SendResult {
  success: boolean;
  message: string;
}

export interface Status {
  state: "connected" | "disconnected";
  url: string;
  error: string;
}

export interface AudioHeaderFieldRule {
  name: string;
  type: string;
  length: number;
  endian: string;
  defaultValue: string;
  rule: string;
}

export interface AudioStreamConfig {
  filePath: string;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  frameMs: number;
  seqStart: number;
  headerRules: AudioHeaderFieldRule[];
}

export interface FilePickResult {
  success: boolean;
  path: string;
  message: string;
}

export interface AudioFileInfo {
  success: boolean;
  path: string;
  format: string;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  dataBytes: number;
  message: string;
}

export interface AudioStreamStatus {
  running: boolean;
  filePath: string;
  frameBytes: number;
  frameMs: number;
  sentFrames: number;
  sentBytes: number;
  lastError: string;
  finishReason: string;
}

export type SessionProfileType = "translation" | "chat";

export interface SessionSummary {
  profileType: SessionProfileType;
  status: string;
  startedFrame?: Frame;
  finalFrame?: Frame;
  sessionFinishedFrame?: Frame;
  extractedText: string;
  extractedAudioChunks?: number;
  extractedAudioBytes?: number;
  error: string;
}

/** Saved profile: a complete send configuration snapshot. */
export interface SendProfile {
  id: string;
  name: string;
  sessionProfile: SessionProfileType;
  translationFromLanguage: string;
  translationToLanguagesText: string;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  frameMs: number;
  seqStart: number;
  headerRules: AudioHeaderFieldRule[];
  textPayload: string;
}

/** Reusable template: a JSON snippet or header rule preset. */
export interface SendTemplate {
  id: string;
  name: string;
  type: "json" | "header";
  /** For json type: the JSON string content. For header type: JSON-serialized AudioHeaderFieldRule[]. */
  content: string;
}
