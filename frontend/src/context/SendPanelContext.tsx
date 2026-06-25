import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { AudioFileInfo, AudioHeaderFieldRule, AudioStreamStatus, SessionProfileType } from "../types";

export type HeaderTemplate = {
  name: string;
  seqStart: number;
  headerRules: AudioHeaderFieldRule[];
};

export type ScrollExpandPreset = "sensitive" | "stable";

/** Props passed from App.tsx — the "business" layer of the send panel. */
export type Props = {
  textPayload: string;
  binaryPayload: string;
  binaryFilePath: string;
  pcmFilePath: string;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  frameMs: number;
  seqStart: number;
  headerRules: AudioHeaderFieldRule[];
  headerTemplates: HeaderTemplate[];
  streaming: boolean;
  connected: boolean;
  sessionProfile: SessionProfileType;
  streamStatus: AudioStreamStatus;
  micStreaming: boolean;
  micInputLevel: number;
  micWaveform: number[];
  playbackWaveform: number[];
  audioFileInfo?: AudioFileInfo;
  translationFromLanguage: string;
  translationToLanguagesText: string;
  audioParamSource: string;
  headerConfigSource: string;
  onTextChange: (value: string) => void;
  onBinaryChange: (value: string) => void;
  onBinaryFilePathChange: (value: string) => void;
  onPcmFilePathChange: (value: string) => void;
  onPickBinaryFile: () => void;
  onPickPcmFile: () => void;
  onSampleRateChange: (value: number) => void;
  onChannelsChange: (value: number) => void;
  onBitDepthChange: (value: number) => void;
  onFrameMsChange: (value: number) => void;
  onSeqStartChange: (value: number) => void;
  onHeaderRulesChange: (value: AudioHeaderFieldRule[]) => void;
  onSaveHeaderTemplate: () => void;
  onLoadHeaderTemplate: (index: number) => void;
  onRenameHeaderTemplate: (index: number) => void;
  onDeleteHeaderTemplate: (index: number) => void;
  onApplyMiniTranslationPreset: () => void;
  onRunMiniTranslation: () => void;
  onTranslationFromLanguageChange: (value: string) => void;
  onTranslationToLanguagesChange: (value: string) => void;
  onApplyTranslationLanguagePreset: (fromLanguage: string, toLanguages: string[]) => void;
  onSessionProfileChange: (value: SessionProfileType) => void;
  onApplyJSONTemplate: (template: string) => void;
  onSendText: () => void;
  onSendBinary: () => void;
  onSendBinaryFile: () => void;
  onRunSession: () => void;
  onStartStream: () => void;
  onStopStream: () => void;
  onStartMicStream: () => void;
  onStopMicStream: () => void;
  onScrollCollapse?: (collapsed: boolean) => void;
  scrollExpandPreset: ScrollExpandPreset;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
};

/** UI state owned by the new command-center layout. */
interface SendPanelUIState {
  expandedHeaderRuleIds: Set<number>;
  setExpandedHeaderRuleIds: Dispatch<SetStateAction<Set<number>>>;
  showTemplateManager: boolean;
  setShowTemplateManager: Dispatch<SetStateAction<boolean>>;
}

export type SendPanelContextValue = Props & SendPanelUIState;

const SendPanelContext = createContext<SendPanelContextValue | null>(null);

export function useSendPanelContext(): SendPanelContextValue {
  const ctx = useContext(SendPanelContext);
  if (!ctx) {
    throw new Error("useSendPanelContext must be used inside <SendPanel>");
  }
  return ctx;
}

export { SendPanelContext };
