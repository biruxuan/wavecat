import type {
  AudioFileInfo,
  AudioStreamConfig,
  AudioStreamStatus,
  ConnectionConfig,
  FilePickResult,
  Frame,
  SendResult,
  Status,
} from "../types";

type AppBridge = {
  WsConnect: (config: ConnectionConfig) => Promise<SendResult>;
  WsDisconnect: () => Promise<SendResult>;
  WsSendText: (message: string) => Promise<SendResult>;
  WsSendBinaryBase64: (encoded: string) => Promise<SendResult>;
  WsSendBinaryFile: (filePath: string) => Promise<SendResult>;
  WsPing: () => Promise<SendResult>;
  WsGetFrames: () => Promise<Frame[]>;
  WsClearFrames: () => Promise<SendResult>;
  WsStatus: () => Promise<Status>;
  WsStartPCMStream: (config: AudioStreamConfig) => Promise<SendResult>;
  WsStartMicStream: (config: AudioStreamConfig) => Promise<SendResult>;
  WsSendMicChunkBase64: (encoded: string) => Promise<SendResult>;
  WsStopMicStream: () => Promise<SendResult>;
  WsStopPCMStream: () => Promise<SendResult>;
  WsPCMStreamStatus: () => Promise<AudioStreamStatus>;
  WsPickBinaryFile: () => Promise<FilePickResult>;
  WsPickPCMFile: () => Promise<FilePickResult>;
  WsInspectAudioFile: (filePath: string) => Promise<AudioFileInfo>;
  WsSavePCMBytes: (base64Data: string) => Promise<SendResult>;
  DebugLowerSeparatorLogPath: () => Promise<string>;
  DebugClearLowerSeparatorLog: () => Promise<SendResult>;
  DebugWriteLowerSeparatorLog: (entry: string) => Promise<SendResult>;
};

function appBridge(): AppBridge {
  const bridge = (window as unknown as { go?: { main?: { App?: AppBridge } } }).go?.main?.App;
  if (!bridge) {
    throw new Error("Wails bridge 不可用，请通过 wails dev 启动应用");
  }
  return bridge;
}

export async function wsConnect(config: ConnectionConfig): Promise<SendResult> {
  return appBridge().WsConnect(config);
}

export async function wsDisconnect(): Promise<SendResult> {
  return appBridge().WsDisconnect();
}

export async function wsSendText(message: string): Promise<SendResult> {
  return appBridge().WsSendText(message);
}

export async function wsSendBinaryBase64(encoded: string): Promise<SendResult> {
  return appBridge().WsSendBinaryBase64(encoded);
}

export async function wsSendBinaryFile(filePath: string): Promise<SendResult> {
  return appBridge().WsSendBinaryFile(filePath);
}

export async function wsPing(): Promise<SendResult> {
  return appBridge().WsPing();
}

export async function wsGetFrames(): Promise<Frame[]> {
  return appBridge().WsGetFrames();
}

export async function wsClearFrames(): Promise<SendResult> {
  return appBridge().WsClearFrames();
}

export async function wsStatus(): Promise<Status> {
  return appBridge().WsStatus();
}

export async function wsStartPCMStream(config: AudioStreamConfig): Promise<SendResult> {
  return appBridge().WsStartPCMStream(config);
}

export async function wsStartMicStream(config: AudioStreamConfig): Promise<SendResult> {
  return appBridge().WsStartMicStream(config);
}

export async function wsSendMicChunkBase64(encoded: string): Promise<SendResult> {
  return appBridge().WsSendMicChunkBase64(encoded);
}

export async function wsStopMicStream(): Promise<SendResult> {
  return appBridge().WsStopMicStream();
}

export async function wsStopPCMStream(): Promise<SendResult> {
  return appBridge().WsStopPCMStream();
}

export async function wsPCMStreamStatus(): Promise<AudioStreamStatus> {
  return appBridge().WsPCMStreamStatus();
}

export async function wsPickBinaryFile(): Promise<FilePickResult> {
  return appBridge().WsPickBinaryFile();
}

export async function wsPickPCMFile(): Promise<FilePickResult> {
  return appBridge().WsPickPCMFile();
}

export async function wsInspectAudioFile(filePath: string): Promise<AudioFileInfo> {
  return appBridge().WsInspectAudioFile(filePath);
}

export async function wsSavePCMBytes(base64Data: string): Promise<SendResult> {
  return appBridge().WsSavePCMBytes(base64Data);
}

export async function wsDebugLowerSeparatorLogPath(): Promise<string> {
  return appBridge().DebugLowerSeparatorLogPath();
}

export async function wsDebugClearLowerSeparatorLog(): Promise<SendResult> {
  return appBridge().DebugClearLowerSeparatorLog();
}

export async function wsDebugWriteLowerSeparatorLog(entry: string): Promise<SendResult> {
  return appBridge().DebugWriteLowerSeparatorLog(entry);
}
