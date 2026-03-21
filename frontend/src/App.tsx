import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Group, Panel, Separator, type PanelImperativeHandle } from "react-resizable-panels";
import "./App.css";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { FrameDetail } from "./components/FrameDetail";
import { FrameList } from "./components/FrameList";
import { ResponsePanel } from "./components/ResponsePanel";
import { SendPanel } from "./components/SendPanel";
import { useMicStream } from "./hooks/useMicStream";
import { RealTimePCMPlayer, type PCMChunkDiagnostics } from "./services/pcmPlayer";
import {
    wsDebugClearLowerSeparatorLog,
    wsDebugLowerSeparatorLogPath,
    wsDebugWriteLowerSeparatorLog,
    wsClearFrames,
    wsConnect,
    wsDisconnect,
    wsInspectAudioFile,
    wsGetFrames,
    wsPCMStreamStatus,
    wsPing,
    wsPickBinaryFile,
    wsPickPCMFile,
    wsSendBinaryBase64,
    wsSendBinaryFile,
    wsSendText,
    wsStartPCMStream,
    wsStopPCMStream,
    wsStatus,
    wsSavePCMBytes,
} from "./services/api";
import type { AudioFileInfo, AudioHeaderFieldRule, AudioStreamStatus, Frame, SessionProfileType, SessionSummary } from "./types";

function App() {
    const MAIN_SPLIT_BREAKPOINT = 1320;
    const LOWER_SEPARATOR_DEBUG_STORAGE_KEY = "wavecat.lowerSeparatorDebug";
    const miniTranslationHeaderPreset = [
        { name: "magic", type: "uint16", length: 2, endian: "big", defaultValue: "43605", rule: "default" },
        { name: "version", type: "uint8", length: 1, endian: "big", defaultValue: "1", rule: "default" },
        { name: "chunk_type", type: "uint8", length: 1, endian: "big", defaultValue: "2", rule: "default" },
        { name: "stream_id", type: "uint16", length: 2, endian: "big", defaultValue: "6", rule: "default" },
        { name: "seq", type: "uint32", length: 4, endian: "big", defaultValue: "0", rule: "seq" },
        { name: "payload_len", type: "uint16", length: 2, endian: "big", defaultValue: "0", rule: "payload_len" },
    ];
    type SessionRunConfig = {
        profileType: SessionProfileType;
        filePath: string;
        sampleRate: number;
        channels: number;
        bitDepth: number;
        frameMs: number;
        seqStart: number;
        headerRules: AudioHeaderFieldRule[];
    };

    type LastDraftConfig = {
        url: string;
        headersText: string;
        queryParamsText: string;
        subprotocol: string;
        textPayload: string;
        binaryPayload: string;
        binaryFilePath: string;
        pcmFilePath: string;
        sampleRate: number;
        channels: number;
        bitDepth: number;
        frameMs: number;
        seqStart: number;
        translationFromLanguage: string;
        translationToLanguagesText: string;
        sessionProfile: SessionProfileType;
    };

    const [url, setUrl] = useState("ws://127.0.0.1:8080/ws");
    const [headersText, setHeadersText] = useState("{}");
    const [queryParamsText, setQueryParamsText] = useState("{}");
    const [subprotocol, setSubprotocol] = useState("");
    const [statusText, setStatusText] = useState("disconnected");
    const [connected, setConnected] = useState(false);
    const [frames, setFrames] = useState<Frame[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [frameDetailCollapsed, setFrameDetailCollapsed] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [directionFilter, setDirectionFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState("all");
    const [compactMainLayout, setCompactMainLayout] = useState(
        typeof window !== "undefined" ? window.innerWidth < MAIN_SPLIT_BREAKPOINT : false
    );
    const [textPayload, setTextPayload] = useState('{"type":"hello"}');
    const [binaryPayload, setBinaryPayload] = useState("aGVsbG8=");
    const [binaryFilePath, setBinaryFilePath] = useState("");
    const [pcmFilePath, setPcmFilePath] = useState("");
    const [sampleRate, setSampleRate] = useState(16000);
    const [channels, setChannels] = useState(1);
    const [bitDepth, setBitDepth] = useState(16);
    const [frameMs, setFrameMs] = useState(20);
    const [seqStart, setSeqStart] = useState(0);
    const [translationFromLanguage, setTranslationFromLanguage] = useState("zh-CN");
    const [translationToLanguagesText, setTranslationToLanguagesText] = useState("en-US");
    const [audioParamSource, setAudioParamSource] = useState("Mini Translation preset");
    const [headerConfigSource, setHeaderConfigSource] = useState("Mini Translation preset");
    const [jsonVariableContext, setJSONVariableContext] = useState({
        conversationId: "test",
        streamId: 6,
    });
    const [headerRules, setHeaderRules] = useState(miniTranslationHeaderPreset);
    const [headerTemplates, setHeaderTemplates] = useState<
        Array<{ name: string; seqStart: number; headerRules: typeof headerRules }>
    >([]);
    const [streaming, setStreaming] = useState(false);
    const [sessionProfile, setSessionProfile] = useState<SessionProfileType>("translation");
    const [streamStatus, setStreamStatus] = useState<AudioStreamStatus>({
        running: false,
        filePath: "",
        frameBytes: 0,
        frameMs: 0,
        sentFrames: 0,
        sentBytes: 0,
        lastError: "",
        finishReason: "",
    });
    const [audioFileInfo, setAudioFileInfo] = useState<AudioFileInfo | undefined>(undefined);
    const [connectionPanelCollapsed, setConnectionPanelCollapsed] = useState(false);
    const connectionPanelRef = useRef<PanelImperativeHandle | null>(null);
    const PANEL_COLLAPSE_ANIMATION_MS = 205;
    const PANEL_DRAG_SOFT_ZONE_PERCENT = 0.6;
    const PANEL_DRAG_CLAMP_EPSILON_PERCENT = 0.08;
    const DEFAULT_LOWER_SEPARATOR_POINTER_SPEED_ADJUSTABLE_THRESHOLD_PX_PER_MS = 1.2;
    const DEFAULT_LOWER_SEPARATOR_POINTER_MIN_TRIGGER_SPEED_PX_PER_MS = 0.8;
    const LOWER_SEPARATOR_POINTER_MIN_SAMPLE_TIME_MS = 8;
    const LOWER_SEPARATOR_POINTER_MIN_UPWARD_DELTA_PX = 2;
    const LOWER_SEPARATOR_POINTER_MIN_DOWNWARD_RELEASE_DELTA_PX = 6;
    const LOWER_SEPARATOR_POINTER_MIN_TRIGGER_TRAVEL_PX = 18;
    const LOWER_SEPARATOR_POINTER_MIN_TRIGGER_STREAK = 2;
    const LOWER_SEPARATOR_POINTER_SPEED_EMA_ALPHA = 0.35;
    const CONNECTION_EXPAND_VISUAL_BUFFER_PX = 18;
    const CONNECTION_COLLAPSED_HEIGHT_PX = 42;
    const CONNECTION_COLLAPSED_EPSILON_PX = 2;
    const PANEL_MIN_GAP_PX = 1;
    const FRAME_PANEL_COLLAPSED_HEIGHT_PX = 42;
    const [connectionLowerSeparatorMinPercent, setConnectionLowerSeparatorMinPercent] = useState<number | null>(null);
    const [connectionLowerSeparatorLockActive, setConnectionLowerSeparatorLockActive] = useState(false);
    const lastExpandedConnectionSizeRef = useRef(25);
    const connectionResizeStartSizeRef = useRef<number | null>(null);
    const connectionResizeDraggingRef = useRef(false);
    const connectionCollapsedAtResizeStartRef = useRef(false);
    const connectionPendingExpandAfterDragRef = useRef(false);
    const connectionExpandAnimatingRef = useRef(false);
    const connectionExpandAnimationFrameRef = useRef<number | null>(null);
    const connectionCollapseAnimatingRef = useRef(false);
    const connectionCollapseAnimationFrameRef = useRef<number | null>(null);
    const collapseSourceRef = useRef<"button" | "drag" | null>(null);
    const [frameListCollapsed, setFrameListCollapsed] = useState(false);
    const frameListPanelRef = useRef<PanelImperativeHandle | null>(null);
    const lastExpandedFrameListSizeRef = useRef(50);
    const frameListResizeStartSizeRef = useRef<number | null>(null);
    const frameListExpandAnimatingRef = useRef(false);
    const frameListExpandAnimationFrameRef = useRef<number | null>(null);
    const frameListCollapseSourceRef = useRef<"button" | "drag" | null>(null);
    const frameDetailPanelRef = useRef<PanelImperativeHandle | null>(null);
    const lastExpandedFrameDetailSizeRef = useRef(50);
    const frameDetailResizeStartSizeRef = useRef<number | null>(null);
    const frameDetailExpandAnimatingRef = useRef(false);
    const frameDetailExpandAnimationFrameRef = useRef<number | null>(null);
    const frameDetailCollapseSourceRef = useRef<"button" | "drag" | null>(null);
    const [responsePanelCollapsed, setResponsePanelCollapsed] = useState(false);
    const responsePanelRef = useRef<PanelImperativeHandle | null>(null);
    const lastExpandedResponseSizeRef = useRef(40);
    const responseResizeStartSizeRef = useRef<number | null>(null);
    const responseResizeDraggingRef = useRef(false);
    const responseExpandAnimatingRef = useRef(false);
    const responseExpandAnimationFrameRef = useRef<number | null>(null);
    const responseCollapseSourceRef = useRef<"button" | "drag" | null>(null);
    const frameRightResizeDraggingRef = useRef(false);
    const [sendPanelCollapsed, setSendPanelCollapsed] = useState(false);
    const sendPanelRef = useRef<PanelImperativeHandle | null>(null);
    const lastExpandedSendSizeRef = useRef(35);
    const sendResizeStartSizeRef = useRef<number | null>(null);
    const sendResizeDraggingRef = useRef(false);
    const sendExpandAnimatingRef = useRef(false);
    const sendExpandAnimationFrameRef = useRef<number | null>(null);
    const sendCollapseSourceRef = useRef<"button" | "drag" | null>(null);
    const lowerSeparatorDragActiveRef = useRef(false);
    const lowerSeparatorSendCollapsedAtStartRef = useRef(false);
    const lowerSeparatorAllowConnectionCascadeRef = useRef(false);
    const lowerSeparatorCascadeTriggeredRef = useRef(false);
    const lowerSeparatorLockAfterSendCollapsedRef = useRef(false);
    const lowerSeparatorHardLockedRef = useRef(false);
    const lowerSeparatorLockedResponseSizeRef = useRef<number | null>(null);
    const lowerSeparatorConnectionSizeAtStartRef = useRef<number | null>(null);
    const lowerSeparatorConnectionPixelsAtStartRef = useRef<number | null>(null);
    const lowerSeparatorConnectionCollapsedAtStartRef = useRef(false);
    const lowerSeparatorPendingConnectionExpandRef = useRef(false);
    const lowerSeparatorLastPointerYRef = useRef<number | null>(null);
    const lowerSeparatorLastPointerTimeRef = useRef<number | null>(null);
    const lowerSeparatorSpeedEmaRef = useRef<number | null>(null);
    const lowerSeparatorUpwardTravelRef = useRef(0);
    const lowerSeparatorUpwardFastStreakRef = useRef(0);
    const lowerSeparatorPointerMoveHandlerRef = useRef<((e: PointerEvent) => void) | null>(null);
    const [lowerSeparatorDragInProgress, setLowerSeparatorDragInProgress] = useState(false);
    const lowerSeparatorMoveSampleCountRef = useRef(0);
    const connectionResizeDebugLastBranchRef = useRef<"animating-collapse" | "animating-expand" | "drag-cascade" | "drag-blocked" | "normal" | null>(null);
    const connectionResizeDebugLastCollapsedRef = useRef<boolean | null>(null);
    const [scrollExpandPreset, setScrollExpandPreset] = useState<"sensitive" | "stable">("sensitive");
    const [lowerSeparatorPointerSpeedAdjustableThreshold, setLowerSeparatorPointerSpeedAdjustableThreshold] = useState(
        DEFAULT_LOWER_SEPARATOR_POINTER_SPEED_ADJUSTABLE_THRESHOLD_PX_PER_MS
    );
    const [lowerSeparatorPointerMinTriggerSpeed, setLowerSeparatorPointerMinTriggerSpeed] = useState(
        DEFAULT_LOWER_SEPARATOR_POINTER_MIN_TRIGGER_SPEED_PX_PER_MS
    );
    const lowerSeparatorPointerTriggerSpeed = Math.max(
        lowerSeparatorPointerSpeedAdjustableThreshold,
        lowerSeparatorPointerMinTriggerSpeed
    );
    const pxToLeftColPercent = (px: number): number => {
        const s = connectionPanelRef.current?.getSize();
        if (s && s.asPercentage > 0 && s.inPixels > 0) {
            const h = s.inPixels / (s.asPercentage / 100);
            if (Number.isFinite(h) && h > 0) return Math.min(100, Math.max(0.1, (px / h) * 100));
        }
        return Math.min(100, Math.max(0.1, (px / 750) * 100));
    };
    const pxToRightColPercent = (px: number): number => {
        const s = frameListPanelRef.current?.getSize();
        if (s && s.asPercentage > 0 && s.inPixels > 0) {
            const h = s.inPixels / (s.asPercentage / 100);
            if (Number.isFinite(h) && h > 0) return Math.min(100, Math.max(0.1, (px / h) * 100));
        }
        return Math.min(100, Math.max(0.1, (px / 750) * 100));
    };
    const connectionPanelEffectiveMinPercent =
        connectionLowerSeparatorMinPercent ?? pxToLeftColPercent(CONNECTION_COLLAPSED_HEIGHT_PX + PANEL_MIN_GAP_PX);
    const connectionPanelEffectiveCollapsible = true;
    const lowerSeparatorDebugEnabled =
        typeof window !== "undefined"
            ? (window.localStorage.getItem(LOWER_SEPARATOR_DEBUG_STORAGE_KEY) ?? "1") === "1"
            : true;
    const lowerSeparatorDebugSessionIdRef = useRef(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    const lowerSeparatorDebugSeqRef = useRef(0);

    const logLowerSeparatorDebug = (event: string, payload?: Record<string, unknown>) => {
        if (!lowerSeparatorDebugEnabled) {
            return;
        }
        const record = {
            sessionId: lowerSeparatorDebugSessionIdRef.current,
            seq: ++lowerSeparatorDebugSeqRef.current,
            clientTs: new Date().toISOString(),
            event,
            payload: payload ?? {},
        };
        void wsDebugWriteLowerSeparatorLog(JSON.stringify(record)).catch(() => {
            // Ignore logging failures; diagnostics should not affect runtime behavior.
        });
    };

    useEffect(() => {
        if (!lowerSeparatorDebugEnabled) {
            return;
        }

        const initializeDebugLog = async () => {
            try {
                const path = await wsDebugLowerSeparatorLogPath();
                await wsDebugClearLowerSeparatorLog();
                await wsDebugWriteLowerSeparatorLog(
                    JSON.stringify({
                        event: "debug-session-start",
                        payload: {
                            path,
                            sessionId: lowerSeparatorDebugSessionIdRef.current,
                            triggerSpeed: lowerSeparatorPointerTriggerSpeed,
                            adjustableThreshold: lowerSeparatorPointerSpeedAdjustableThreshold,
                            minTriggerSpeed: lowerSeparatorPointerMinTriggerSpeed,
                        },
                    })
                );
            } catch {
                // Ignore logging failures; diagnostics should not affect runtime behavior.
            }
        };

        void initializeDebugLog();
    }, [
        lowerSeparatorDebugEnabled,
    ]);

    useEffect(() => {
        logLowerSeparatorDebug("debug-threshold-updated", {
            triggerSpeed: lowerSeparatorPointerTriggerSpeed,
            adjustableThreshold: lowerSeparatorPointerSpeedAdjustableThreshold,
            minTriggerSpeed: lowerSeparatorPointerMinTriggerSpeed,
        });
    }, [
        lowerSeparatorDebugEnabled,
        lowerSeparatorPointerTriggerSpeed,
        lowerSeparatorPointerSpeedAdjustableThreshold,
        lowerSeparatorPointerMinTriggerSpeed,
    ]);

    useEffect(() => {
        if (!lowerSeparatorDragInProgress) {
            setConnectionLowerSeparatorMinPercent(null);
            setConnectionLowerSeparatorLockActive(false);
        }
    }, [lowerSeparatorDragInProgress]);
    const [autoPlayServerPCM, setAutoPlayServerPCM] = useState(true);
    const [serverPCMSampleRate, setServerPCMSampleRate] = useState(16000);
    const [serverPCMChannels, setServerPCMChannels] = useState(1);
    const [serverPCMMaxScheduledSources, setServerPCMMaxScheduledSources] = useState(10);
    const [serverPCMMinStartBufferMs, setServerPCMMinStartBufferMs] = useState(120);
    const [serverPCMCrossfadeMs, setServerPCMCrossfadeMs] = useState(0);
    const [serverPCMAdaptiveRateEnabled, setServerPCMAdaptiveRateEnabled] = useState(true);
    const [serverPCMAdaptiveRateStrength, setServerPCMAdaptiveRateStrength] = useState(1);
    const [serverPCMPlaying, setServerPCMPlaying] = useState(false);
    const [serverPCMPlayedChunks, setServerPCMPlayedChunks] = useState(0);
    const [audioProbe, setAudioProbe] = useState({
        scanned: 0,
        matched: 0,
        failed: 0,
        skipped: 0,
        queueLength: 0,
        scheduledSources: 0,
        lastReason: "",
        lastOperationId: "",
        lastDurationMs: 0,
        lastBytes: 0,
        lastRms: 0,
        lastPeak: 0,
        lastBoundaryJump: 0,
        lastSmoothingMs: 0,
    });
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [probeDetailsOpen, setProbeDetailsOpen] = useState(false);
    const [savedConnections, setSavedConnections] = useState<
        Array<{ name: string; url: string; headersText: string; queryParamsText: string; subprotocol: string }>
    >([]);
    const [sessionSummary, setSessionSummary] = useState<SessionSummary>({
        profileType: "translation",
        status: "idle",
        extractedText: "",
        extractedAudioChunks: 0,
        extractedAudioBytes: 0,
        error: "",
    });
    const inFlightRef = useRef(false);
    const lastStatusRef = useRef("");
    const lastFrameSigRef = useRef("");
    const pendingResponseRef = useRef(false);
    const pendingAfterIdRef = useRef<number>(0);
    const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const formatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionRunnerRef = useRef(false);
    const sessionStatusRef = useRef("");
    const statusPinnedRef = useRef(false);
    const settingsRef = useRef<HTMLDivElement | null>(null);
    const [liveAssistantText, setLiveAssistantText] = useState("");
    const pcmPlayerRef = useRef<RealTimePCMPlayer | null>(null);
    const logSessionStartRef = useRef<number | null>(null);
    const pcmRecordingRef = useRef<Uint8Array[] | null>(null);
    const [pcmRecording, setPcmRecording] = useState(false);
    const [chunkLog, setChunkLog] = useState<Array<{
        t: number; rms: number; peak: number; jump: number; bytes: number; dur: number;
    }>>([]);
    const lastPlayedInboundFrameIdRef = useRef(0);
    const lastProcessedTextFrameIdRef = useRef(0);
    const playbackPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const streamedAudioOperationIdsRef = useRef<Set<string>>(new Set());
    const [playbackWaveform, setPlaybackWaveform] = useState<number[]>([]);
    const [playbackPositionSec, setPlaybackPositionSec] = useState(0);
    const [playbackTotalDurationSec, setPlaybackTotalDurationSec] = useState(0);
    const playbackPosRafRef = useRef<number | null>(null);

    const cloneMiniTranslationHeaderPreset = () =>
        miniTranslationHeaderPreset.map((rule) => ({ ...rule }));

    const easeOutCubic = (t: number) => {
        return 1 - Math.pow(1 - t, 3);
    };

    const getPanelCollapsedSizePercent = (
        panelRef: React.RefObject<PanelImperativeHandle | null>,
        collapsedPx: number,
        fallbackPercent: number
    ) => {
        const current = panelRef.current?.getSize();
        if (!current || current.asPercentage <= 0 || current.inPixels <= 0) {
            return fallbackPercent;
        }
        const estimatedContainerPixels = current.inPixels / (current.asPercentage / 100);
        if (!Number.isFinite(estimatedContainerPixels) || estimatedContainerPixels <= 0) {
            return fallbackPercent;
        }
        const targetPercent = (collapsedPx / estimatedContainerPixels) * 100;
        return Math.min(100, Math.max(1, targetPercent));
    };

    const getConnectionCollapsedSizePercent = () => getPanelCollapsedSizePercent(connectionPanelRef, CONNECTION_COLLAPSED_HEIGHT_PX, 5);
    const getSendCollapsedSizePercent = () => getPanelCollapsedSizePercent(sendPanelRef, CONNECTION_COLLAPSED_HEIGHT_PX, 5);
    const getResponseCollapsedSizePercent = () => getPanelCollapsedSizePercent(responsePanelRef, CONNECTION_COLLAPSED_HEIGHT_PX, 5);
    const getFrameListCollapsedSizePercent = () => getPanelCollapsedSizePercent(frameListPanelRef, FRAME_PANEL_COLLAPSED_HEIGHT_PX, 5);
    const getFrameDetailCollapsedSizePercent = () => getPanelCollapsedSizePercent(frameDetailPanelRef, FRAME_PANEL_COLLAPSED_HEIGHT_PX, 5);

    const isPanelVisuallyCollapsed = (
        panelRef: React.RefObject<PanelImperativeHandle | null>,
        collapsedPx: number,
        epsilonPx = CONNECTION_COLLAPSED_EPSILON_PX,
        sizeOverride?: { inPixels: number }
    ) => {
        const size = sizeOverride ?? panelRef.current?.getSize();
        if (!size) {
            return Boolean(panelRef.current?.isCollapsed());
        }
        return size.inPixels <= collapsedPx + epsilonPx;
    };

    const isConnectionPhysicallyCollapsed = () => {
        return isPanelVisuallyCollapsed(connectionPanelRef, CONNECTION_COLLAPSED_HEIGHT_PX);
    };

    const normalizeLanguageTag = (raw: string) => {
        const trimmed = raw.trim();
        if (!trimmed) {
            return "";
        }
        const parts = trimmed.split("-").filter(Boolean);
        if (parts.length === 0) {
            return "";
        }
        return parts
            .map((part, index) => {
                if (index === 0) {
                    return part.toLowerCase();
                }
                if (part.length === 2 || part.length === 3) {
                    return part.toUpperCase();
                }
                return part;
            })
            .join("-");
    };

    const parseTranslationToLanguages = (raw: string) => {
        const normalized = raw
            .split(/[\s,|]+/)
            .map((item) => normalizeLanguageTag(item))
            .filter(Boolean);
        return Array.from(new Set(normalized));
    };

    const buildTranslationStartTemplate = (fromLanguageRaw = translationFromLanguage, toLanguagesRaw = translationToLanguagesText) => {
        const fromLanguage = normalizeLanguageTag(fromLanguageRaw) || "zh-CN";
        const toLanguages = parseTranslationToLanguages(toLanguagesRaw);
        const normalizedTargets = toLanguages.length > 0 ? toLanguages : ["en-US"];
        return `{
  "message_id": "${"${message_id}"}",
  "operation_id": "${"${operation_id}"}",
  "conversation_id": "${"${conversation_id}"}",
  "stream_id": ${"${stream_id}"},
  "type": "translation",
  "event": "start",
  "payload": {
    "from_language": "${fromLanguage}",
    "to_languages": ${JSON.stringify(normalizedTargets)}
  },
  "created_at": ${"${created_at}"}
}`;
    };

    const updateStatus = (message: string, options?: { pin?: boolean; force?: boolean }) => {
        if (statusPinnedRef.current && !options?.force && !options?.pin) {
            return;
        }
        if (options?.pin) {
            statusPinnedRef.current = true;
        }
        lastStatusRef.current = message;
        setStatusText(message);
    };

    const clearPinnedStatus = () => {
        statusPinnedRef.current = false;
    };

    const {
        micStreaming,
        micInputLevel,
        micWaveform,
        setMicStreaming,
        resetMicVisuals,
        releaseMicCapture,
        handleStartMicStream,
        handleStopMicStream,
    } = useMicStream({
        connected,
        streaming,
        sampleRate,
        channels,
        bitDepth,
        frameMs,
        seqStart,
        headerRules,
        setStreaming,
        updateStatus,
    });

    const clearPendingResponse = () => {
        pendingResponseRef.current = false;
        pendingAfterIdRef.current = 0;
        if (pendingTimerRef.current) {
            clearTimeout(pendingTimerRef.current);
            pendingTimerRef.current = null;
        }
    };

    const beginPendingResponse = (afterId: number) => {
        clearPendingResponse();
        pendingResponseRef.current = true;
        pendingAfterIdRef.current = afterId;
        updateStatus("sent, waiting response...");
        pendingTimerRef.current = setTimeout(() => {
            if (pendingResponseRef.current) {
                pendingResponseRef.current = false;
                updateStatus("no response in 5s (server may not echo)");
            }
        }, 5000);
    };

    const extractPCMBase64FromInboundFrame = (frame: Frame) => {
        if (frame.direction !== "in") {
            return { chunk: "", reason: "not_inbound" };
        }
        const rawText = frame.text?.trim();
        if (!rawText) {
            return { chunk: "", reason: "empty_text" };
        }
        try {
            const parsed = JSON.parse(rawText) as {
                operation_id?: unknown;
                type?: unknown;
                event?: unknown;
                payload?: {
                    role?: unknown;
                    content_type?: unknown;
                    delta?: unknown;
                    audio?: unknown;
                };
            };

            // 协议要求：以 type / event / role / content_type 做业务判断，source_type 仅为诊断字段禁止用于主流程
            const msgType = typeof parsed.type === "string" ? parsed.type.toLowerCase() : "";
            if (msgType !== "chat") {
                return { chunk: "", reason: "not_chat" };
            }

            const eventName = typeof parsed.event === "string" ? parsed.event.trim().toLowerCase() : "";
            const operationId = typeof parsed.operation_id === "string" ? parsed.operation_id.trim() : "";
            const role = typeof parsed.payload?.role === "string" ? parsed.payload.role.trim().toLowerCase() : "";
            const contentType =
                typeof parsed.payload?.content_type === "string" ? parsed.payload.content_type.trim().toLowerCase() : "";

            const isBase64Like = (value: string) =>
                /^[A-Za-z0-9+/=\s]+$/.test(value) && value.replace(/\s/g, "").length >= 8;

            const isSemanticAssistantAudio = contentType === "audio" && (role === "assistant" || role === "");

            // event=interim → payload.delta 为 Base64 PCM S16LE 分片
            if (eventName === "interim") {
                const delta = parsed.payload?.delta;
                if (isSemanticAssistantAudio && typeof delta === "string" && isBase64Like(delta)) {
                    if (role === "assistant") {
                        return { chunk: delta, reason: "matched_interim_delta", operationId, eventName };
                    }
                    return { chunk: delta, reason: "matched_interim_delta_no_role", operationId, eventName };
                }
                if (isSemanticAssistantAudio) {
                    return { chunk: "", reason: "invalid_interim_delta", operationId, eventName };
                }
                return {
                    chunk: "",
                    reason: `not_assistant_audio(${eventName || "unknown"}/${role || "none"}/${contentType || "none"})`,
                    operationId,
                    eventName,
                };
            }

            // event=result → payload.audio 为完整音频 Base64
            if (eventName === "result") {
                const audio = parsed.payload?.audio;
                if (isSemanticAssistantAudio && typeof audio === "string" && audio.trim().length === 0) {
                    return { chunk: "", reason: "skip_empty_result_audio", operationId, eventName };
                }
                if (isSemanticAssistantAudio && typeof audio === "string" && isBase64Like(audio)) {
                    if (operationId && streamedAudioOperationIdsRef.current.has(operationId)) {
                        return { chunk: "", reason: "skip_duplicate_result_audio_after_interim", operationId, eventName };
                    }
                    if (role === "assistant") {
                        return { chunk: audio, reason: "matched_result_audio", operationId, eventName };
                    }
                    return { chunk: audio, reason: "matched_result_audio_no_role", operationId, eventName };
                }
                if (isSemanticAssistantAudio) {
                    return { chunk: "", reason: "invalid_result_audio", operationId, eventName };
                }
                return {
                    chunk: "",
                    reason: `not_assistant_audio(${eventName || "unknown"}/${role || "none"}/${contentType || "none"})`,
                    operationId,
                    eventName,
                };
            }

            return {
                chunk: "",
                reason: `event_ignored(${eventName || "unknown"}/${role || "none"}/${contentType || "none"})`,
                operationId,
                eventName,
            };
        } catch {
            return { chunk: "", reason: "json_parse_error", operationId: "", eventName: "" };
        }
    };

    const buildWaveformSlotsFromPCMBase64 = (
        base64: string,
        sampleRateHz: number,
        channelsCount: number,
        slotMs = 50,
    ): number[] => {
        try {
            const normalized = base64.replace(/\s/g, "");
            if (!normalized) return [];

            const raw = atob(normalized);
            const byteLen = raw.length - (raw.length % 2);
            if (byteLen < 2) return [];

            const channelsSafe = Math.max(1, channelsCount | 0);
            const sampleRateSafe = Math.max(1, sampleRateHz | 0);

            const totalSamples = Math.floor(byteLen / 2);
            const totalFrames = Math.floor(totalSamples / channelsSafe);
            if (totalFrames <= 0) return [];

            const framesPerSlot = Math.max(1, Math.round((sampleRateSafe * slotMs) / 1000));
            const slotCount = Math.max(1, Math.ceil(totalFrames / framesPerSlot));
            const slots: number[] = new Array(slotCount);

            for (let slot = 0; slot < slotCount; slot += 1) {
                const frameStart = slot * framesPerSlot;
                const frameEnd = Math.min(totalFrames, frameStart + framesPerSlot);

                let sumSq = 0;
                let peak = 0;
                let count = 0;

                for (let frameIndex = frameStart; frameIndex < frameEnd; frameIndex += 1) {
                    const sampleBase = frameIndex * channelsSafe;
                    for (let ch = 0; ch < channelsSafe; ch += 1) {
                        const sampleIndex = sampleBase + ch;
                        const byteIndex = sampleIndex * 2;
                        if (byteIndex + 1 >= byteLen) break;

                        const lo = raw.charCodeAt(byteIndex);
                        const hi = raw.charCodeAt(byteIndex + 1);
                        let signed = (hi << 8) | lo;
                        if (signed & 0x8000) signed -= 0x10000;

                        const normalizedAbs = Math.abs(signed / 32768);
                        sumSq += normalizedAbs * normalizedAbs;
                        if (normalizedAbs > peak) peak = normalizedAbs;
                        count += 1;
                    }
                }

                if (count <= 0) {
                    slots[slot] = 0;
                    continue;
                }

                const rms = Math.sqrt(sumSq / count);
                const amp = Math.sqrt(Math.max(0, Math.min(1, Math.max(rms, peak * 0.75))));
                slots[slot] = Math.max(0, Math.min(1, amp));
            }

            return slots;
        } catch {
            return [];
        }
    };

    const processInboundTextChunks = (nextFrames: Frame[]) => {
        const newFrames = nextFrames.filter(
            (f) => f.direction === "in" && f.id > lastProcessedTextFrameIdRef.current
        );
        if (newFrames.length === 0) return;

        let lastId = lastProcessedTextFrameIdRef.current;
        let appendText = "";
        let resultContent = "";
        let hadResult = false;
        let isNewTurn = false;

        for (const frame of newFrames) {
            lastId = Math.max(lastId, frame.id);
            const raw = frame.text?.trim();
            if (!raw) continue;
            try {
                const parsed = JSON.parse(raw) as {
                    type?: unknown;
                    event?: unknown;
                    payload?: {
                        role?: unknown;
                        content_type?: unknown;
                        delta?: unknown;
                        content?: unknown;
                        accepted?: unknown;
                    };
                };

                if (parsed.type === "chat") {
                    const event = typeof parsed.event === "string" ? parsed.event : "";
                    const role = typeof parsed.payload?.role === "string" ? parsed.payload.role : "";
                    const contentType = typeof parsed.payload?.content_type === "string" ? parsed.payload.content_type : "";

                    // event=accepted signals start of a new reply turn — reset accumulated text
                    if (event === "accepted") {
                        isNewTurn = true;
                        appendText = "";
                        resultContent = "";
                        hadResult = false;
                    }

                    if (role === "assistant" && contentType === "text") {
                        if (event === "interim") {
                            const delta = parsed.payload?.delta;
                            if (typeof delta === "string" && delta) {
                                appendText += delta;
                            }
                        } else if (event === "result") {
                            const content = parsed.payload?.content;
                            if (typeof content === "string" && content) {
                                hadResult = true;
                                resultContent = content;
                            }
                        }
                    }
                } else if (parsed.type === "translation") {
                    const event = typeof parsed.event === "string" ? parsed.event : "";
                    if (event === "interim" || event === "result") {
                        const extracted = extractTranslationText(raw);
                        if (extracted) {
                            if (event === "result") {
                                hadResult = true;
                                resultContent = extracted;
                            } else {
                                appendText = extracted; // replace with latest interim (not cumulative)
                            }
                        }
                    }
                }
            } catch {
                // ignore parse errors
            }
        }

        lastProcessedTextFrameIdRef.current = lastId;

        if (hadResult) {
            setLiveAssistantText(resultContent);
        } else if (isNewTurn) {
            setLiveAssistantText(appendText);
        } else if (appendText) {
            setLiveAssistantText((prev) => prev + appendText);
        }
    };

    const createPCMPlayer = (): RealTimePCMPlayer => {
        const player = new RealTimePCMPlayer();
        player.setMaxScheduledSources(serverPCMMaxScheduledSources);
        player.setMinStartBufferedMs(serverPCMMinStartBufferMs);
        player.setBoundaryCrossfadeMs(serverPCMCrossfadeMs);
        player.setAdaptiveRateEnabled(serverPCMAdaptiveRateEnabled);
        player.setAdaptiveRateStrength(serverPCMAdaptiveRateStrength);
        player.onRawBytes = (bytes) => {
            if (pcmRecordingRef.current) {
                pcmRecordingRef.current.push(bytes);
            }
        };
        player.onChunkPlaying = (diag) => {
            setAudioProbe((prev) => ({
                ...prev,
                lastBytes: diag.bytes,
                lastDurationMs: diag.durationMs,
                lastRms: diag.rms,
                lastPeak: diag.peak,
                lastBoundaryJump: diag.boundaryJump,
                lastSmoothingMs: diag.smoothingMs,
            }));
            const now = Date.now();
            if (logSessionStartRef.current === null) {
                logSessionStartRef.current = now;
            }
            const t = now - logSessionStartRef.current;
            const entry = { t, rms: diag.rms, peak: diag.peak, jump: diag.boundaryJump, bytes: diag.bytes, dur: diag.durationMs };
            setChunkLog((prev) => {
                const next = [...prev, entry];
                return next.length > 60 ? next.slice(next.length - 60) : next;
            });
            // Played-index is now driven by the RAF loop polling getSmoothedPlaybackIndex()
        };
        return player;
    };

    useEffect(() => {
        if (pcmPlayerRef.current) {
            pcmPlayerRef.current.setMaxScheduledSources(serverPCMMaxScheduledSources);
            pcmPlayerRef.current.setMinStartBufferedMs(serverPCMMinStartBufferMs);
            pcmPlayerRef.current.setBoundaryCrossfadeMs(serverPCMCrossfadeMs);
            pcmPlayerRef.current.setAdaptiveRateEnabled(serverPCMAdaptiveRateEnabled);
            pcmPlayerRef.current.setAdaptiveRateStrength(serverPCMAdaptiveRateStrength);
        }
    }, [
        serverPCMMaxScheduledSources,
        serverPCMMinStartBufferMs,
        serverPCMCrossfadeMs,
        serverPCMAdaptiveRateEnabled,
        serverPCMAdaptiveRateStrength,
    ]);

    useEffect(() => {
        const onResize = () => {
            setCompactMainLayout(window.innerWidth < MAIN_SPLIT_BREAKPOINT);
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    const collapseConnectionPanel = (collapseSource: "button" | "drag" = "button") => {
        logLowerSeparatorDebug("connection-collapse-start", {
            connectionPanelCollapsed,
            panelIsCollapsed: connectionPanelRef.current?.isCollapsed(),
            panelSize: connectionPanelRef.current?.getSize(),
            collapseSource: collapseSourceRef.current,
        });
        if (connectionPanelCollapsed) {
            return;
        }
        if (connectionCollapseAnimationFrameRef.current !== null) {
            cancelAnimationFrame(connectionCollapseAnimationFrameRef.current);
            connectionCollapseAnimationFrameRef.current = null;
        }
        if (connectionExpandAnimationFrameRef.current !== null) {
            cancelAnimationFrame(connectionExpandAnimationFrameRef.current);
            connectionExpandAnimationFrameRef.current = null;
        }

        // 场景1: 按钮折叠 → 记录此刻高度，expand 时恢复到这里
        const currentSize = connectionPanelRef.current?.getSize().asPercentage;
        if (typeof currentSize === "number" && Number.isFinite(currentSize)) {
            lastExpandedConnectionSizeRef.current = currentSize;
        }

        const startPercent = connectionPanelRef.current?.getSize().asPercentage ?? 25;
        const collapsedPercent = getConnectionCollapsedSizePercent();
        const durationMs = PANEL_COLLAPSE_ANIMATION_MS;

        // Skip animation if already fully collapsed
        if (startPercent <= collapsedPercent + 0.1) {
            collapseSourceRef.current = collapseSource;
            connectionPanelRef.current?.resize(`${collapsedPercent}%`);
            connectionPanelRef.current?.collapse();
            setConnectionPanelCollapsed(isConnectionPhysicallyCollapsed());
            if (collapseSource === "drag") {
                lowerSeparatorAllowConnectionCascadeRef.current = true;
            }
            connectionCollapseAnimatingRef.current = false;
            return;
        }

        collapseSourceRef.current = collapseSource;
        connectionCollapseAnimatingRef.current = true;

        const animate = (now: number, startTime: number) => {
            const rawProgress = Math.min(1, (now - startTime) / durationMs);
            const easedProgress = easeOutCubic(rawProgress);
            const sizePercent = startPercent + (collapsedPercent - startPercent) * easedProgress;
            connectionPanelRef.current?.resize(`${sizePercent}%`);

            if (rawProgress < 1) {
                connectionCollapseAnimationFrameRef.current = requestAnimationFrame((nextNow) => animate(nextNow, startTime));
                return;
            }

            connectionPanelRef.current?.resize(`${collapsedPercent}%`);
            connectionPanelRef.current?.collapse();
            const actuallyCollapsed = isConnectionPhysicallyCollapsed();
            if (actuallyCollapsed) {
                setConnectionPanelCollapsed(true);
            } else {
                flushSync(() => {
                    setLowerSeparatorDragInProgress(false);
                    setConnectionLowerSeparatorMinPercent(null);
                    setConnectionLowerSeparatorLockActive(false);
                });
                const fallbackCollapsedPercent = getConnectionCollapsedSizePercent();
                connectionPanelRef.current?.resize(`${fallbackCollapsedPercent}%`);
                connectionPanelRef.current?.collapse();
                const fallbackCollapsed = isConnectionPhysicallyCollapsed();
                setConnectionPanelCollapsed(fallbackCollapsed);
                logLowerSeparatorDebug("connection-collapse-fallback", {
                    fallbackCollapsed,
                    panelIsCollapsed: connectionPanelRef.current?.isCollapsed(),
                    panelSize: connectionPanelRef.current?.getSize(),
                    fallbackCollapsedPercent,
                });
            }
            if (collapseSource === "drag") {
                lowerSeparatorAllowConnectionCascadeRef.current = true;
            }
            connectionCollapseAnimatingRef.current = false;
            connectionCollapseAnimationFrameRef.current = null;
            logLowerSeparatorDebug("connection-collapse-end", {
                actuallyCollapsed,
                panelIsCollapsed: connectionPanelRef.current?.isCollapsed(),
                panelSize: connectionPanelRef.current?.getSize(),
            });
        };

        connectionCollapseAnimationFrameRef.current = requestAnimationFrame((startNow) => animate(startNow, startNow));
    };

    const expandConnectionPanel = () => {
        logLowerSeparatorDebug("connection-expand-start", {
            connectionPanelCollapsed,
            panelIsCollapsed: connectionPanelRef.current?.isCollapsed(),
            panelSize: connectionPanelRef.current?.getSize(),
            targetSize: lastExpandedConnectionSizeRef.current,
        });
        const targetSize = lastExpandedConnectionSizeRef.current;
        const startSize = connectionPanelRef.current?.getSize().asPercentage ?? 0;
        const durationMs = PANEL_COLLAPSE_ANIMATION_MS;

        if (connectionExpandAnimationFrameRef.current !== null) {
            cancelAnimationFrame(connectionExpandAnimationFrameRef.current);
            connectionExpandAnimationFrameRef.current = null;
        }

        collapseSourceRef.current = null;
        connectionExpandAnimatingRef.current = true;
        setConnectionPanelCollapsed(false);

        const animate = (now: number, startTime: number) => {
            const rawProgress = Math.min(1, (now - startTime) / durationMs);
            const easedProgress = easeOutCubic(rawProgress);
            const size = startSize + (targetSize - startSize) * easedProgress;
            connectionPanelRef.current?.resize(`${size}%`);

            if (rawProgress < 1) {
                connectionExpandAnimationFrameRef.current = requestAnimationFrame((nextNow) => animate(nextNow, startTime));
                return;
            }

            connectionPanelRef.current?.resize(`${targetSize}%`);
            connectionExpandAnimatingRef.current = false;
            connectionExpandAnimationFrameRef.current = null;
            logLowerSeparatorDebug("connection-expand-end", {
                panelIsCollapsed: connectionPanelRef.current?.isCollapsed(),
                panelSize: connectionPanelRef.current?.getSize(),
            });
        };

        connectionExpandAnimationFrameRef.current = requestAnimationFrame((startNow) => animate(startNow, startNow));
    };

    const handleToggleConnectionPanel = () => {
        lowerSeparatorDragActiveRef.current = false;
        lowerSeparatorAllowConnectionCascadeRef.current = false;
        lowerSeparatorCascadeTriggeredRef.current = false;
        lowerSeparatorLockAfterSendCollapsedRef.current = false;
        lowerSeparatorHardLockedRef.current = false;
        if (lowerSeparatorPointerMoveHandlerRef.current) {
            window.removeEventListener("pointermove", lowerSeparatorPointerMoveHandlerRef.current);
            lowerSeparatorPointerMoveHandlerRef.current = null;
        }
        flushSync(() => {
            setLowerSeparatorDragInProgress(false);
            setConnectionLowerSeparatorMinPercent(null);
            setConnectionLowerSeparatorLockActive(false);
        });
        logLowerSeparatorDebug("connection-toggle-click", {
            connectionPanelCollapsed,
            panelIsCollapsed: connectionPanelRef.current?.isCollapsed(),
            panelSize: connectionPanelRef.current?.getSize(),
            connectionPanelEffectiveMinPercent,
            connectionPanelEffectiveCollapsible,
        });
        if (connectionPanelCollapsed) {
            expandConnectionPanel();
            return;
        }
        collapseConnectionPanel();
    };

    const handleConnectionResizeStart = () => {
        lowerSeparatorDragActiveRef.current = false;
        connectionResizeDraggingRef.current = true;
        connectionCollapsedAtResizeStartRef.current = isConnectionPhysicallyCollapsed();
        connectionPendingExpandAfterDragRef.current = false;
        logLowerSeparatorDebug("connection-resize-start", {
            connectionPanelCollapsed,
            physicallyCollapsed: connectionCollapsedAtResizeStartRef.current,
            panelIsCollapsed: connectionPanelRef.current?.isCollapsed(),
            panelSize: connectionPanelRef.current?.getSize(),
        });
        if (!connectionCollapsedAtResizeStartRef.current) {
            // 场景2: 拖拽开始 → 记录此刻高度，如果这次拖拽导致折叠则 expand 恢复到这里
            const currentSize = connectionPanelRef.current?.getSize().asPercentage;
            if (typeof currentSize === "number" && Number.isFinite(currentSize)) {
                connectionResizeStartSizeRef.current = currentSize;
            }
        }
    };

    const handleConnectionPanelResize = (panelSize: { asPercentage: number; inPixels: number }) => {
        const isActuallyCollapsed = isPanelVisuallyCollapsed(
            connectionPanelRef,
            CONNECTION_COLLAPSED_HEIGHT_PX,
            CONNECTION_COLLAPSED_EPSILON_PX,
            panelSize
        );

        const setResizeDebugBranch = (
            branch: "animating-collapse" | "animating-expand" | "drag-cascade" | "drag-blocked" | "normal"
        ) => {
            if (!lowerSeparatorDebugEnabled) {
                return;
            }
            if (
                connectionResizeDebugLastBranchRef.current !== branch ||
                connectionResizeDebugLastCollapsedRef.current !== isActuallyCollapsed
            ) {
                connectionResizeDebugLastBranchRef.current = branch;
                connectionResizeDebugLastCollapsedRef.current = isActuallyCollapsed;
                logLowerSeparatorDebug("connection-resize-branch", {
                    branch,
                    isActuallyCollapsed,
                    panelSize,
                    connectionPanelCollapsed,
                    lowerSeparatorDragActive: lowerSeparatorDragActiveRef.current,
                    lowerSeparatorAllowCascade: lowerSeparatorAllowConnectionCascadeRef.current,
                    lowerSeparatorCascadeTriggered: lowerSeparatorCascadeTriggeredRef.current,
                    connectionLowerSeparatorMinPercent,
                });
            }
        };

        // Ignore resize events during collapse animation
        if (connectionCollapseAnimatingRef.current) {
            setResizeDebugBranch("animating-collapse");
            return;
        }

        if (connectionExpandAnimatingRef.current) {
            setResizeDebugBranch("animating-expand");
            setConnectionPanelCollapsed(false);
            return;
        }

        // During lower separator drag with cascade allowed (threshold-triggered or Send already collapsed)
        if (lowerSeparatorDragActiveRef.current && lowerSeparatorAllowConnectionCascadeRef.current) {
            setResizeDebugBranch("drag-cascade");
            if (lowerSeparatorCascadeTriggeredRef.current) {
                if (isActuallyCollapsed && !connectionPanelCollapsed) {
                    const restoreSize = connectionResizeStartSizeRef.current ?? lastExpandedConnectionSizeRef.current;
                    if (typeof restoreSize === "number" && Number.isFinite(restoreSize) && restoreSize > 1) {
                        lastExpandedConnectionSizeRef.current = restoreSize;
                    }
                    collapseSourceRef.current = "drag";
                }
                setConnectionPanelCollapsed(isActuallyCollapsed);
                return;
            }
            setConnectionPanelCollapsed(isActuallyCollapsed);
            return;
        }

        // During lower separator drag with cascade blocked — lock height via temporary minSize.
        if (lowerSeparatorDragActiveRef.current && !lowerSeparatorAllowConnectionCascadeRef.current) {
            setResizeDebugBranch("drag-blocked");
            setConnectionPanelCollapsed((prev) => (prev === isActuallyCollapsed ? prev : isActuallyCollapsed));
            return;
        }

        setResizeDebugBranch("normal");

        // Normal path (not during lower separator drag)
        if (isActuallyCollapsed) {
            if (connectionResizeDraggingRef.current && connectionResizeStartSizeRef.current !== null && collapseSourceRef.current !== "button") {
                lastExpandedConnectionSizeRef.current = connectionResizeStartSizeRef.current;
                collapseSourceRef.current = "drag";
            }
        } else if (collapseSourceRef.current === null) {
            lastExpandedConnectionSizeRef.current = panelSize.asPercentage;
        }

        setConnectionPanelCollapsed((prev) => (prev === isActuallyCollapsed ? prev : isActuallyCollapsed));
    };

    const collapseFrameListPanel = () => {
        if (frameListCollapsed) {
            return;
        }
        if (frameListExpandAnimationFrameRef.current !== null) {
            cancelAnimationFrame(frameListExpandAnimationFrameRef.current);
            frameListExpandAnimationFrameRef.current = null;
        }

        const currentSize = frameListPanelRef.current?.getSize().asPercentage;
        if (typeof currentSize === "number" && Number.isFinite(currentSize)) {
            lastExpandedFrameListSizeRef.current = currentSize;
        }

        const sizeObj = frameListPanelRef.current?.getSize();
        const startPixels = sizeObj?.inPixels ?? FRAME_PANEL_COLLAPSED_HEIGHT_PX;
        const startPercent = sizeObj?.asPercentage ?? 50;
        const targetPixels = FRAME_PANEL_COLLAPSED_HEIGHT_PX;
        const collapsedPercent = getFrameDetailCollapsedSizePercent();

        if (startPixels <= targetPixels + 0.5) {
            frameListCollapseSourceRef.current = "button";
            frameListPanelRef.current?.resize(`${collapsedPercent}%`);
            frameListPanelRef.current?.collapse();
            setFrameListCollapsed(true);
            frameListExpandAnimatingRef.current = false;
            return;
        }

        frameListCollapseSourceRef.current = "button";
        frameListExpandAnimatingRef.current = true;

        const animate = (now: number, startTime: number) => {
            const rawProgress = Math.min(1, (now - startTime) / PANEL_COLLAPSE_ANIMATION_MS);
            const easedProgress = easeOutCubic(rawProgress);
            const sizePercent = startPercent + (collapsedPercent - startPercent) * easedProgress;
            frameListPanelRef.current?.resize(`${sizePercent}%`);

            if (rawProgress < 1) {
                frameListExpandAnimationFrameRef.current = requestAnimationFrame((nextNow) => animate(nextNow, startTime));
                return;
            }

            frameListPanelRef.current?.resize(`${collapsedPercent}%`);
            frameListPanelRef.current?.collapse();
            setFrameListCollapsed(true);
            frameListExpandAnimatingRef.current = false;
            frameListExpandAnimationFrameRef.current = null;
        };

        frameListExpandAnimationFrameRef.current = requestAnimationFrame((startNow) => animate(startNow, startNow));
    };

    const expandFrameListPanel = () => {
        const targetSize = lastExpandedFrameListSizeRef.current;
        const startSize = frameListPanelRef.current?.getSize().asPercentage ?? 0;

        if (frameListExpandAnimationFrameRef.current !== null) {
            cancelAnimationFrame(frameListExpandAnimationFrameRef.current);
            frameListExpandAnimationFrameRef.current = null;
        }

        frameListCollapseSourceRef.current = null;
        frameListExpandAnimatingRef.current = true;
        frameListPanelRef.current?.expand();
        setFrameListCollapsed(false);

        const animate = (now: number, startTime: number) => {
            const rawProgress = Math.min(1, (now - startTime) / PANEL_COLLAPSE_ANIMATION_MS);
            const easedProgress = easeOutCubic(rawProgress);
            const size = startSize + (targetSize - startSize) * easedProgress;
            frameListPanelRef.current?.resize(`${size}%`);

            if (rawProgress < 1) {
                frameListExpandAnimationFrameRef.current = requestAnimationFrame((nextNow) => animate(nextNow, startTime));
                return;
            }

            frameListPanelRef.current?.resize(`${targetSize}%`);
            frameListExpandAnimatingRef.current = false;
            frameListExpandAnimationFrameRef.current = null;
        };

        frameListExpandAnimationFrameRef.current = requestAnimationFrame((startNow) => animate(startNow, startNow));
    };

    const handleToggleFrameListPanel = () => {
        if (frameListCollapsed) {
            expandFrameListPanel();
            return;
        }
        collapseFrameListPanel();
    };

    const collapseFrameDetailPanel = () => {
        if (frameDetailCollapsed) {
            return;
        }
        if (frameDetailExpandAnimationFrameRef.current !== null) {
            cancelAnimationFrame(frameDetailExpandAnimationFrameRef.current);
            frameDetailExpandAnimationFrameRef.current = null;
        }

        const currentSize = frameDetailPanelRef.current?.getSize().asPercentage;
        if (typeof currentSize === "number" && Number.isFinite(currentSize)) {
            lastExpandedFrameDetailSizeRef.current = currentSize;
        }

        const sizeObj = frameDetailPanelRef.current?.getSize();
        const startPixels = sizeObj?.inPixels ?? FRAME_PANEL_COLLAPSED_HEIGHT_PX;
        const startPercent = sizeObj?.asPercentage ?? 50;
        const targetPixels = FRAME_PANEL_COLLAPSED_HEIGHT_PX;
        const collapsedPercent = getSendCollapsedSizePercent();

        if (startPixels <= targetPixels + 0.5) {
            frameDetailCollapseSourceRef.current = "button";
            frameDetailPanelRef.current?.resize(`${collapsedPercent}%`);
            frameDetailPanelRef.current?.collapse();
            setFrameDetailCollapsed(true);
            frameDetailExpandAnimatingRef.current = false;
            return;
        }

        frameDetailCollapseSourceRef.current = "button";
        frameDetailExpandAnimatingRef.current = true;

        const animate = (now: number, startTime: number) => {
            const rawProgress = Math.min(1, (now - startTime) / PANEL_COLLAPSE_ANIMATION_MS);
            const easedProgress = easeOutCubic(rawProgress);
            const sizePercent = startPercent + (collapsedPercent - startPercent) * easedProgress;
            frameDetailPanelRef.current?.resize(`${sizePercent}%`);

            if (rawProgress < 1) {
                frameDetailExpandAnimationFrameRef.current = requestAnimationFrame((nextNow) => animate(nextNow, startTime));
                return;
            }

            frameDetailPanelRef.current?.resize(`${collapsedPercent}%`);
            frameDetailPanelRef.current?.collapse();
            setFrameDetailCollapsed(true);
            frameDetailExpandAnimatingRef.current = false;
            frameDetailExpandAnimationFrameRef.current = null;
        };

        frameDetailExpandAnimationFrameRef.current = requestAnimationFrame((startNow) => animate(startNow, startNow));
    };

    const expandFrameDetailPanel = () => {
        const targetSize = lastExpandedFrameDetailSizeRef.current;
        const startSize = frameDetailPanelRef.current?.getSize().asPercentage ?? 0;

        if (frameDetailExpandAnimationFrameRef.current !== null) {
            cancelAnimationFrame(frameDetailExpandAnimationFrameRef.current);
            frameDetailExpandAnimationFrameRef.current = null;
        }

        frameDetailCollapseSourceRef.current = null;
        frameDetailExpandAnimatingRef.current = true;
        frameDetailPanelRef.current?.expand();
        setFrameDetailCollapsed(false);

        const animate = (now: number, startTime: number) => {
            const rawProgress = Math.min(1, (now - startTime) / PANEL_COLLAPSE_ANIMATION_MS);
            const easedProgress = easeOutCubic(rawProgress);
            const size = startSize + (targetSize - startSize) * easedProgress;
            frameDetailPanelRef.current?.resize(`${size}%`);

            if (rawProgress < 1) {
                frameDetailExpandAnimationFrameRef.current = requestAnimationFrame((nextNow) => animate(nextNow, startTime));
                return;
            }

            frameDetailPanelRef.current?.resize(`${targetSize}%`);
            frameDetailExpandAnimatingRef.current = false;
            frameDetailExpandAnimationFrameRef.current = null;
        };

        frameDetailExpandAnimationFrameRef.current = requestAnimationFrame((startNow) => animate(startNow, startNow));
    };

    const handleToggleFrameDetailPanel = () => {
        if (frameDetailCollapsed) {
            expandFrameDetailPanel();
            return;
        }
        collapseFrameDetailPanel();
    };

    const handleRightColumnResizeStart = () => {
        frameRightResizeDraggingRef.current = true;

        const frameListSize = frameListPanelRef.current?.getSize().asPercentage;
        if (typeof frameListSize === "number" && Number.isFinite(frameListSize) && !frameListCollapsed) {
            frameListResizeStartSizeRef.current = frameListSize;
        }

        const frameDetailSize = frameDetailPanelRef.current?.getSize().asPercentage;
        if (typeof frameDetailSize === "number" && Number.isFinite(frameDetailSize) && !frameDetailCollapsed) {
            frameDetailResizeStartSizeRef.current = frameDetailSize;
        }
    };

    const handleFrameListPanelResize = (panelSize: { asPercentage: number; inPixels: number }) => {
        const isActuallyCollapsed = frameListPanelRef.current?.isCollapsed() || (panelSize.inPixels <= FRAME_PANEL_COLLAPSED_HEIGHT_PX);

        if (frameListExpandAnimatingRef.current) {
            setFrameListCollapsed(false);
            return;
        }

        if (isActuallyCollapsed) {
            if (frameRightResizeDraggingRef.current && frameListResizeStartSizeRef.current !== null && frameListCollapseSourceRef.current !== "button") {
                lastExpandedFrameListSizeRef.current = frameListResizeStartSizeRef.current;
                frameListCollapseSourceRef.current = "drag";
            }
        } else if (frameListCollapseSourceRef.current === null) {
            lastExpandedFrameListSizeRef.current = panelSize.asPercentage;
        }

        setFrameListCollapsed((prev) => (prev === isActuallyCollapsed ? prev : isActuallyCollapsed));
    };

    const handleFrameDetailPanelResize = (panelSize: { asPercentage: number; inPixels: number }) => {
        const isActuallyCollapsed = frameDetailPanelRef.current?.isCollapsed() || (panelSize.inPixels <= FRAME_PANEL_COLLAPSED_HEIGHT_PX);

        if (frameDetailExpandAnimatingRef.current) {
            setFrameDetailCollapsed(false);
            return;
        }

        if (isActuallyCollapsed) {
            if (frameRightResizeDraggingRef.current && frameDetailResizeStartSizeRef.current !== null && frameDetailCollapseSourceRef.current !== "button") {
                lastExpandedFrameDetailSizeRef.current = frameDetailResizeStartSizeRef.current;
                frameDetailCollapseSourceRef.current = "drag";
            }
        } else if (frameDetailCollapseSourceRef.current === null) {
            lastExpandedFrameDetailSizeRef.current = panelSize.asPercentage;
        }

        setFrameDetailCollapsed((prev) => (prev === isActuallyCollapsed ? prev : isActuallyCollapsed));
    };

    const handleSendResizeStart = () => {
        sendResizeDraggingRef.current = true;
        if (!sendPanelCollapsed) {
            const currentSize = sendPanelRef.current?.getSize().asPercentage;
            if (typeof currentSize === "number" && Number.isFinite(currentSize)) {
                sendResizeStartSizeRef.current = currentSize;
            }
        }
    };

    const collapseSendPanel = () => {
        if (sendPanelCollapsed) return;
        if (sendExpandAnimationFrameRef.current !== null) {
            cancelAnimationFrame(sendExpandAnimationFrameRef.current);
            sendExpandAnimationFrameRef.current = null;
        }
        const currentSize = sendPanelRef.current?.getSize().asPercentage;
        if (typeof currentSize === "number" && Number.isFinite(currentSize)) {
            lastExpandedSendSizeRef.current = currentSize;
        }
        const sizeObj = sendPanelRef.current?.getSize();
        const startPixels = sizeObj?.inPixels ?? CONNECTION_COLLAPSED_HEIGHT_PX;
        const startPercent = sizeObj?.asPercentage ?? 35;
        const targetPixels = CONNECTION_COLLAPSED_HEIGHT_PX;
        const collapsedPercent = getResponseCollapsedSizePercent();

        if (startPixels <= targetPixels + 0.5) {
            sendCollapseSourceRef.current = "button";
            sendPanelRef.current?.resize(`${collapsedPercent}%`);
            sendPanelRef.current?.collapse();
            setSendPanelCollapsed(true);
            sendExpandAnimatingRef.current = false;
            return;
        }
        sendCollapseSourceRef.current = "button";
        sendExpandAnimatingRef.current = true;
        const animate = (now: number, startTime: number) => {
            const rawProgress = Math.min(1, (now - startTime) / PANEL_COLLAPSE_ANIMATION_MS);
            const easedProgress = easeOutCubic(rawProgress);
            const sizePercent = startPercent + (collapsedPercent - startPercent) * easedProgress;
            sendPanelRef.current?.resize(`${sizePercent}%`);
            if (rawProgress < 1) {
                sendExpandAnimationFrameRef.current = requestAnimationFrame((nextNow) => animate(nextNow, startTime));
                return;
            }
            sendPanelRef.current?.resize(`${collapsedPercent}%`);
            sendPanelRef.current?.collapse();
            setSendPanelCollapsed(true);
            sendExpandAnimatingRef.current = false;
            sendExpandAnimationFrameRef.current = null;
        };
        sendExpandAnimationFrameRef.current = requestAnimationFrame((startNow) => animate(startNow, startNow));
    };

    const expandSendPanel = () => {
        const targetSize = lastExpandedSendSizeRef.current;
        const startSize = sendPanelRef.current?.getSize().asPercentage ?? 0;
        if (sendExpandAnimationFrameRef.current !== null) {
            cancelAnimationFrame(sendExpandAnimationFrameRef.current);
            sendExpandAnimationFrameRef.current = null;
        }
        sendCollapseSourceRef.current = null;
        sendExpandAnimatingRef.current = true;
        sendPanelRef.current?.expand();
        setSendPanelCollapsed(false);
        const animate = (now: number, startTime: number) => {
            const rawProgress = Math.min(1, (now - startTime) / PANEL_COLLAPSE_ANIMATION_MS);
            const easedProgress = easeOutCubic(rawProgress);
            const size = startSize + (targetSize - startSize) * easedProgress;
            sendPanelRef.current?.resize(`${size}%`);
            if (rawProgress < 1) {
                sendExpandAnimationFrameRef.current = requestAnimationFrame((nextNow) => animate(nextNow, startTime));
                return;
            }
            sendPanelRef.current?.resize(`${targetSize}%`);
            sendExpandAnimatingRef.current = false;
            sendExpandAnimationFrameRef.current = null;
        };
        sendExpandAnimationFrameRef.current = requestAnimationFrame((startNow) => animate(startNow, startNow));
    };

    const handleToggleSendPanel = () => {
        if (sendPanelCollapsed) {
            expandSendPanel();
            return;
        }
        collapseSendPanel();
    };

    const handleSendPanelResize = (panelSize: { asPercentage: number; inPixels: number }) => {
        const isActuallyCollapsed = isPanelVisuallyCollapsed(
            sendPanelRef,
            CONNECTION_COLLAPSED_HEIGHT_PX,
            CONNECTION_COLLAPSED_EPSILON_PX,
            panelSize
        );

        if (
            lowerSeparatorDragActiveRef.current &&
            lowerSeparatorCascadeTriggeredRef.current &&
            !isActuallyCollapsed
        ) {
            const collapsedPercent = getSendCollapsedSizePercent();
            sendPanelRef.current?.resize(`${collapsedPercent}%`);
            sendPanelRef.current?.collapse();
            setSendPanelCollapsed(true);
            return;
        }

        if (sendExpandAnimatingRef.current) {
            setSendPanelCollapsed(false);
            return;
        }

        if (
            lowerSeparatorDragActiveRef.current &&
            !lowerSeparatorSendCollapsedAtStartRef.current &&
            !lowerSeparatorLockAfterSendCollapsedRef.current &&
            !lowerSeparatorCascadeTriggeredRef.current &&
            isActuallyCollapsed
        ) {
            lowerSeparatorLockAfterSendCollapsedRef.current = true;
            lowerSeparatorHardLockedRef.current = false;
            const lockedResponse = responsePanelRef.current?.getSize().asPercentage;
            if (typeof lockedResponse === "number" && Number.isFinite(lockedResponse)) {
                lowerSeparatorLockedResponseSizeRef.current = lockedResponse;
            }
            const lockedConnection =
                lowerSeparatorConnectionSizeAtStartRef.current ?? connectionPanelRef.current?.getSize().asPercentage ?? null;
            if (typeof lockedConnection === "number" && Number.isFinite(lockedConnection) && lockedConnection > 0) {
                setConnectionLowerSeparatorMinPercent(lockedConnection);
            }
            lowerSeparatorAllowConnectionCascadeRef.current = false;
        }

        if (isActuallyCollapsed) {
            if (sendResizeDraggingRef.current && sendResizeStartSizeRef.current !== null && sendCollapseSourceRef.current !== "button") {
                lastExpandedSendSizeRef.current = sendResizeStartSizeRef.current;
                sendCollapseSourceRef.current = "drag";
            }
        } else if (sendCollapseSourceRef.current === null) {
            lastExpandedSendSizeRef.current = panelSize.asPercentage;
        }

        if (
            lowerSeparatorDragActiveRef.current &&
            !lowerSeparatorSendCollapsedAtStartRef.current &&
            lowerSeparatorLockAfterSendCollapsedRef.current &&
            !isActuallyCollapsed
        ) {
            lowerSeparatorLockAfterSendCollapsedRef.current = false;
            lowerSeparatorHardLockedRef.current = false;
            lowerSeparatorLockedResponseSizeRef.current = null;
            setConnectionLowerSeparatorMinPercent(null);
        }

        setSendPanelCollapsed((prev) => (prev === isActuallyCollapsed ? prev : isActuallyCollapsed));
    };

    const handleResponseResizeStart = () => {
        logLowerSeparatorDebug("response-resize-start", {
            sendPanelCollapsed,
            connectionPanelCollapsed,
            connectionSize: connectionPanelRef.current?.getSize(),
            responseSize: responsePanelRef.current?.getSize(),
            triggerSpeed: lowerSeparatorPointerTriggerSpeed,
            adjustableThreshold: lowerSeparatorPointerSpeedAdjustableThreshold,
            minTriggerSpeed: lowerSeparatorPointerMinTriggerSpeed,
            lowerSeparatorDragInProgress,
            connectionPanelEffectiveMinPercent,
            connectionPanelEffectiveCollapsible,
            connectionLowerSeparatorLockActive,
            connectionLowerSeparatorMinPercent,
        });
        responseResizeDraggingRef.current = true;
        if (!responsePanelCollapsed) {
            const currentSize = responsePanelRef.current?.getSize().asPercentage;
            if (typeof currentSize === "number" && Number.isFinite(currentSize)) {
                responseResizeStartSizeRef.current = currentSize;
            }
        }

        lowerSeparatorDragActiveRef.current = true;
        setLowerSeparatorDragInProgress(true);
        lowerSeparatorSendCollapsedAtStartRef.current = sendPanelCollapsed;
        lowerSeparatorAllowConnectionCascadeRef.current = false;
        lowerSeparatorCascadeTriggeredRef.current = false;
        lowerSeparatorLockAfterSendCollapsedRef.current = false;
        lowerSeparatorHardLockedRef.current = false;
        lowerSeparatorLockedResponseSizeRef.current = null;

        // Initialize Connection resize start size for potential cascade collapse
        if (!connectionPanelCollapsed) {
            const currentConnectionSize = connectionPanelRef.current?.getSize().asPercentage;
            if (typeof currentConnectionSize === "number" && Number.isFinite(currentConnectionSize)) {
                connectionResizeStartSizeRef.current = currentConnectionSize;
            }
        }

        const connectionSize = connectionPanelRef.current?.getSize().asPercentage;
        lowerSeparatorConnectionSizeAtStartRef.current =
            typeof connectionSize === "number" && Number.isFinite(connectionSize) ? connectionSize : null;
        const connectionPixels = connectionPanelRef.current?.getSize().inPixels;
        lowerSeparatorConnectionPixelsAtStartRef.current =
            typeof connectionPixels === "number" && Number.isFinite(connectionPixels) ? connectionPixels : null;
        lowerSeparatorConnectionCollapsedAtStartRef.current = isConnectionPhysicallyCollapsed();
        lowerSeparatorPendingConnectionExpandRef.current = false;
        setConnectionLowerSeparatorMinPercent(null);
        setConnectionLowerSeparatorLockActive(false);

        // Pointer-based speed detection: track Y position to detect fast upward drag
        lowerSeparatorLastPointerYRef.current = null;
        lowerSeparatorLastPointerTimeRef.current = null;
        lowerSeparatorSpeedEmaRef.current = null;
        lowerSeparatorUpwardTravelRef.current = 0;
        lowerSeparatorUpwardFastStreakRef.current = 0;
        lowerSeparatorMoveSampleCountRef.current = 0;

        // Remove stale handler if any
        if (lowerSeparatorPointerMoveHandlerRef.current) {
            window.removeEventListener("pointermove", lowerSeparatorPointerMoveHandlerRef.current);
        }

        const onPointerMove = (e: PointerEvent) => {
            const lastY = lowerSeparatorLastPointerYRef.current;
            const lastTime = lowerSeparatorLastPointerTimeRef.current;
            const now = performance.now();

            if (typeof lastY === "number" && typeof lastTime === "number") {
                const timeDelta = now - lastTime;
                if (timeDelta >= LOWER_SEPARATOR_POINTER_MIN_SAMPLE_TIME_MS) {
                    const deltaY = e.clientY - lastY;
                    const speed = Math.abs(deltaY) / timeDelta; // px per ms
                    const prevEma = lowerSeparatorSpeedEmaRef.current;
                    const speedEma =
                        prevEma === null
                            ? speed
                            : prevEma * (1 - LOWER_SEPARATOR_POINTER_SPEED_EMA_ALPHA) + speed * LOWER_SEPARATOR_POINTER_SPEED_EMA_ALPHA;
                    lowerSeparatorSpeedEmaRef.current = speedEma;
                    const canEvaluateCascadeSpeed =
                        lowerSeparatorDragActiveRef.current &&
                        (lowerSeparatorSendCollapsedAtStartRef.current || lowerSeparatorLockAfterSendCollapsedRef.current);
                    const isUpwardSpeedQualifiedSample =
                        deltaY <= -LOWER_SEPARATOR_POINTER_MIN_UPWARD_DELTA_PX &&
                        Math.max(speed, speedEma) >= lowerSeparatorPointerMinTriggerSpeed;
                    const isUpwardDeltaQualifiedSample = deltaY <= -LOWER_SEPARATOR_POINTER_MIN_UPWARD_DELTA_PX;

                    lowerSeparatorMoveSampleCountRef.current += 1;
                    if (lowerSeparatorDebugEnabled && lowerSeparatorMoveSampleCountRef.current % 8 === 0) {
                        logLowerSeparatorDebug("pointer-move-sample", {
                            deltaY,
                            timeDelta,
                            speed,
                            speedEma,
                            triggerSpeed: lowerSeparatorPointerTriggerSpeed,
                            upwardTravel: lowerSeparatorUpwardTravelRef.current,
                            upwardFastStreak: lowerSeparatorUpwardFastStreakRef.current,
                            canEvaluateCascadeSpeed,
                            cascadeTriggered: lowerSeparatorCascadeTriggeredRef.current,
                            allowCascade: lowerSeparatorAllowConnectionCascadeRef.current,
                            connectionPanelSize: connectionPanelRef.current?.getSize(),
                            sendPanelSize: sendPanelRef.current?.getSize(),
                            responsePanelSize: responsePanelRef.current?.getSize(),
                        });
                    }

                    if (canEvaluateCascadeSpeed) {
                        if (isUpwardSpeedQualifiedSample) {
                            lowerSeparatorUpwardTravelRef.current += -deltaY;
                            lowerSeparatorUpwardFastStreakRef.current += 1;
                        } else if (deltaY >= LOWER_SEPARATOR_POINTER_MIN_DOWNWARD_RELEASE_DELTA_PX) {
                            if (lowerSeparatorCascadeTriggeredRef.current) {
                                const currentResponseSize = responsePanelRef.current?.getSize().asPercentage ?? 0;
                                const lockedResponseSize = lowerSeparatorLockedResponseSizeRef.current;
                                const reachedResponseRestorePoint =
                                    typeof lockedResponseSize === "number" &&
                                    Number.isFinite(lockedResponseSize) &&
                                    currentResponseSize <= lockedResponseSize + PANEL_DRAG_CLAMP_EPSILON_PERCENT;

                                // 阶段1：先恢复 response 到锁定前大小，保持 send 折叠。
                                if (!reachedResponseRestorePoint) {
                                    const sendCollapsedPercent = getSendCollapsedSizePercent();
                                    sendPanelRef.current?.resize(`${sendCollapsedPercent}%`);
                                    sendPanelRef.current?.collapse();
                                    setSendPanelCollapsed(true);
                                    return;
                                }

                                // 阶段2：达到恢复点后释放级联，允许继续下拖展开 send；
                                // 若拖拽开始前 send/connection 已折叠，则优先展开其对应面板。
                                lowerSeparatorCascadeTriggeredRef.current = false;
                                lowerSeparatorAllowConnectionCascadeRef.current = false;
                                lowerSeparatorPendingConnectionExpandRef.current = true;
                                lowerSeparatorHardLockedRef.current = false;
                                lowerSeparatorLockAfterSendCollapsedRef.current = false;

                                if (lowerSeparatorSendCollapsedAtStartRef.current) {
                                    sendPanelRef.current?.expand();
                                    setSendPanelCollapsed(false);
                                }
                                if (lowerSeparatorConnectionCollapsedAtStartRef.current) {
                                    connectionPanelRef.current?.expand();
                                    setConnectionPanelCollapsed(false);
                                }

                                lowerSeparatorLockedResponseSizeRef.current = null;
                            }

                            // 只有明确向下回拖时重置速度追踪
                            lowerSeparatorUpwardTravelRef.current = 0;
                            lowerSeparatorUpwardFastStreakRef.current = 0;
                        } else if (deltaY > 0) {
                            lowerSeparatorUpwardFastStreakRef.current = 0;
                        } else {
                            lowerSeparatorUpwardFastStreakRef.current = 0;
                        }
                    } else {
                        lowerSeparatorUpwardTravelRef.current = 0;
                        lowerSeparatorUpwardFastStreakRef.current = 0;
                    }

                    const shouldTriggerCascadeWithoutSpeedGate =
                        lowerSeparatorSendCollapsedAtStartRef.current && isUpwardDeltaQualifiedSample;
                    const shouldTriggerCascadeWithSpeedGate =
                        isUpwardSpeedQualifiedSample &&
                        lowerSeparatorUpwardTravelRef.current >= LOWER_SEPARATOR_POINTER_MIN_TRIGGER_TRAVEL_PX &&
                        lowerSeparatorUpwardFastStreakRef.current >= LOWER_SEPARATOR_POINTER_MIN_TRIGGER_STREAK;

                    if (
                        canEvaluateCascadeSpeed &&
                        !lowerSeparatorCascadeTriggeredRef.current &&
                        (shouldTriggerCascadeWithoutSpeedGate || shouldTriggerCascadeWithSpeedGate)
                    ) {
                        // Threshold reached while dragging up: enable cascade and collapse Connection UI
                        logLowerSeparatorDebug("cascade-triggered", {
                            deltaY,
                            timeDelta,
                            speed,
                            speedEma,
                            triggerSpeed: lowerSeparatorPointerTriggerSpeed,
                            upwardTravel: lowerSeparatorUpwardTravelRef.current,
                            upwardFastStreak: lowerSeparatorUpwardFastStreakRef.current,
                            connectionSize: connectionPanelRef.current?.getSize(),
                            sendSize: sendPanelRef.current?.getSize(),
                            responseSize: responsePanelRef.current?.getSize(),
                            triggerMode: shouldTriggerCascadeWithoutSpeedGate ? "send-collapsed-no-speed-gate" : "speed-gated",
                        });
                        lowerSeparatorAllowConnectionCascadeRef.current = true;
                        lowerSeparatorCascadeTriggeredRef.current = true;
                        lowerSeparatorPendingConnectionExpandRef.current = false;
                        flushSync(() => {
                            setConnectionLowerSeparatorMinPercent(null);
                            setConnectionLowerSeparatorLockActive(false);
                        });

                        // 立即冻结send面板，防止在connection动画期间被自动推大
                        const isActuallySendCollapsed = isPanelVisuallyCollapsed(
                            sendPanelRef,
                            CONNECTION_COLLAPSED_HEIGHT_PX
                        );
                        if (!isActuallySendCollapsed) {
                            const collapsedPercent = getSendCollapsedSizePercent();
                            sendPanelRef.current?.resize(`${collapsedPercent}%`);
                            sendPanelRef.current?.collapse();
                            flushSync(() => {
                                setSendPanelCollapsed(true);
                            });
                        }
                        
                        // 锁定response大小，防止send在connection动画期间被自动推大
                        const lockedResponse = responsePanelRef.current?.getSize().asPercentage;
                        if (typeof lockedResponse === "number" && Number.isFinite(lockedResponse)) {
                            lowerSeparatorLockedResponseSizeRef.current = lockedResponse;
                            lowerSeparatorHardLockedRef.current = true;
                        }

                        if (!connectionPanelCollapsed && !connectionCollapseAnimatingRef.current) {
                            const currentSize = connectionPanelRef.current?.getSize().asPercentage;
                            if (typeof currentSize === "number" && Number.isFinite(currentSize)) {
                                lastExpandedConnectionSizeRef.current = currentSize;
                            }
                        }
                    }
                }
            }

            lowerSeparatorLastPointerYRef.current = e.clientY;
            lowerSeparatorLastPointerTimeRef.current = now;
        };

        lowerSeparatorPointerMoveHandlerRef.current = onPointerMove;
        window.addEventListener("pointermove", onPointerMove);
    };

    const collapseResponsePanel = () => {
        if (responsePanelCollapsed) return;
        if (responseExpandAnimationFrameRef.current !== null) {
            cancelAnimationFrame(responseExpandAnimationFrameRef.current);
            responseExpandAnimationFrameRef.current = null;
        }
        const currentSize = responsePanelRef.current?.getSize().asPercentage;
        if (typeof currentSize === "number" && Number.isFinite(currentSize)) {
            lastExpandedResponseSizeRef.current = currentSize;
        }
        const sizeObj = responsePanelRef.current?.getSize();
        const startPixels = sizeObj?.inPixels ?? FRAME_PANEL_COLLAPSED_HEIGHT_PX;
        const startPercent = sizeObj?.asPercentage ?? 40;
        const targetPixels = FRAME_PANEL_COLLAPSED_HEIGHT_PX;
        const collapsedPercent = getConnectionCollapsedSizePercent();

        if (startPixels <= targetPixels + 0.5) {
            responseCollapseSourceRef.current = "button";
            responsePanelRef.current?.resize(`${collapsedPercent}%`);
            responsePanelRef.current?.collapse();
            setResponsePanelCollapsed(true);
            responseExpandAnimatingRef.current = false;
            return;
        }
        responseCollapseSourceRef.current = "button";
        responseExpandAnimatingRef.current = true;
        const animate = (now: number, startTime: number) => {
            const rawProgress = Math.min(1, (now - startTime) / PANEL_COLLAPSE_ANIMATION_MS);
            const easedProgress = easeOutCubic(rawProgress);
            const sizePercent = startPercent + (collapsedPercent - startPercent) * easedProgress;
            responsePanelRef.current?.resize(`${sizePercent}%`);
            if (rawProgress < 1) {
                responseExpandAnimationFrameRef.current = requestAnimationFrame((nextNow) => animate(nextNow, startTime));
                return;
            }
            responsePanelRef.current?.resize(`${collapsedPercent}%`);
            responsePanelRef.current?.collapse();
            setResponsePanelCollapsed(true);
            responseExpandAnimatingRef.current = false;
            responseExpandAnimationFrameRef.current = null;
        };
        responseExpandAnimationFrameRef.current = requestAnimationFrame((startNow) => animate(startNow, startNow));
    };

    const expandResponsePanel = () => {
        const targetSize = lastExpandedResponseSizeRef.current;
        const startSize = responsePanelRef.current?.getSize().asPercentage ?? 0;
        if (responseExpandAnimationFrameRef.current !== null) {
            cancelAnimationFrame(responseExpandAnimationFrameRef.current);
            responseExpandAnimationFrameRef.current = null;
        }
        responseCollapseSourceRef.current = null;
        responseExpandAnimatingRef.current = true;
        responsePanelRef.current?.expand();
        setResponsePanelCollapsed(false);
        const animate = (now: number, startTime: number) => {
            const rawProgress = Math.min(1, (now - startTime) / PANEL_COLLAPSE_ANIMATION_MS);
            const easedProgress = easeOutCubic(rawProgress);
            const size = startSize + (targetSize - startSize) * easedProgress;
            responsePanelRef.current?.resize(`${size}%`);
            if (rawProgress < 1) {
                responseExpandAnimationFrameRef.current = requestAnimationFrame((nextNow) => animate(nextNow, startTime));
                return;
            }
            responsePanelRef.current?.resize(`${targetSize}%`);
            responseExpandAnimatingRef.current = false;
            responseExpandAnimationFrameRef.current = null;
        };
        responseExpandAnimationFrameRef.current = requestAnimationFrame((startNow) => animate(startNow, startNow));
    };

    const handleToggleResponsePanel = () => {
        if (responsePanelCollapsed) {
            expandResponsePanel();
            return;
        }
        collapseResponsePanel();
    };

    const handleResponsePanelResize = (panelSize: { asPercentage: number; inPixels: number }) => {
        const isActuallyCollapsed = isPanelVisuallyCollapsed(
            responsePanelRef,
            FRAME_PANEL_COLLAPSED_HEIGHT_PX,
            CONNECTION_COLLAPSED_EPSILON_PX,
            panelSize
        );
        if (responseExpandAnimatingRef.current) {
            setResponsePanelCollapsed(false);
            return;
        }

        // 下分隔条高速拖拽期间冻结 response 状态，避免 onResize 中反复 resize 回拉导致闪烁。
        if (
            lowerSeparatorDragActiveRef.current &&
            (lowerSeparatorCascadeTriggeredRef.current || lowerSeparatorLockAfterSendCollapsedRef.current)
        ) {
            if (lowerSeparatorCascadeTriggeredRef.current) {
                const lockedSize = lowerSeparatorLockedResponseSizeRef.current;
                if (typeof lockedSize === "number" && Number.isFinite(lockedSize)) {
                    const hasReachedRestorePoint = panelSize.asPercentage <= lockedSize + PANEL_DRAG_CLAMP_EPSILON_PERCENT;
                    if (!hasReachedRestorePoint) {
                        const sendCollapsedPercent = getSendCollapsedSizePercent();
                        if (!isPanelVisuallyCollapsed(sendPanelRef, CONNECTION_COLLAPSED_HEIGHT_PX)) {
                            sendPanelRef.current?.resize(`${sendCollapsedPercent}%`);
                            sendPanelRef.current?.collapse();
                            setSendPanelCollapsed(true);
                        }
                        return;
                    }

                    lowerSeparatorCascadeTriggeredRef.current = false;
                    lowerSeparatorAllowConnectionCascadeRef.current = false;
                    lowerSeparatorHardLockedRef.current = false;
                    lowerSeparatorLockAfterSendCollapsedRef.current = false;
                    lowerSeparatorLockedResponseSizeRef.current = null;
                }
            }

            if (lowerSeparatorLockAfterSendCollapsedRef.current && !lowerSeparatorCascadeTriggeredRef.current) {
                const lockedSize = lowerSeparatorLockedResponseSizeRef.current;
                if (typeof lockedSize === "number" && Number.isFinite(lockedSize)) {
                    if (Math.abs(panelSize.asPercentage - lockedSize) > 0.05) {
                        responsePanelRef.current?.resize(`${lockedSize}%`);
                    }
                }

                const sendCollapsedPercent = getSendCollapsedSizePercent();
                if (!isPanelVisuallyCollapsed(sendPanelRef, CONNECTION_COLLAPSED_HEIGHT_PX)) {
                    sendPanelRef.current?.resize(`${sendCollapsedPercent}%`);
                    sendPanelRef.current?.collapse();
                }
                return;
            }
            return;
        }

        if (isActuallyCollapsed) {
            if (responseResizeDraggingRef.current && responseResizeStartSizeRef.current !== null && responseCollapseSourceRef.current !== "button") {
                lastExpandedResponseSizeRef.current = responseResizeStartSizeRef.current;
                responseCollapseSourceRef.current = "drag";
            }
        } else if (responseCollapseSourceRef.current === null) {
            lastExpandedResponseSizeRef.current = panelSize.asPercentage;
        }
        setResponsePanelCollapsed((prev) => (prev === isActuallyCollapsed ? prev : isActuallyCollapsed));
    };

    useEffect(() => {
        const handlePointerUp = () => {
            const wasLowerSeparatorDragActive = lowerSeparatorDragActiveRef.current;
            const connectionPixelsAtPointerUp = connectionPanelRef.current?.getSize().inPixels;
            const isConnectionPhysicallyCollapsedAtPointerUp = isPanelVisuallyCollapsed(
                connectionPanelRef,
                CONNECTION_COLLAPSED_HEIGHT_PX,
                CONNECTION_COLLAPSED_EPSILON_PX,
                typeof connectionPixelsAtPointerUp === "number" ? { inPixels: connectionPixelsAtPointerUp } : undefined
            );
            const shouldFinalizeConnectionCollapse =
                wasLowerSeparatorDragActive &&
                lowerSeparatorCascadeTriggeredRef.current &&
                isConnectionPhysicallyCollapsedAtPointerUp;
            logLowerSeparatorDebug("pointer-up-summary", {
                shouldFinalizeConnectionCollapse,
                isConnectionPhysicallyCollapsedAtPointerUp,
                connectionPixelsAtPointerUp,
                connectionPanelCollapsed,
                connectionPanelIsCollapsed: connectionPanelRef.current?.isCollapsed(),
                connectionPanelSize: connectionPanelRef.current?.getSize(),
                sendPanelSize: sendPanelRef.current?.getSize(),
                responsePanelSize: responsePanelRef.current?.getSize(),
                lowerSeparatorCascadeTriggered: lowerSeparatorCascadeTriggeredRef.current,
                lowerSeparatorAllowCascade: lowerSeparatorAllowConnectionCascadeRef.current,
                lowerSeparatorPendingExpand: lowerSeparatorPendingConnectionExpandRef.current,
                lowerSeparatorConnectionSizeAtStart: lowerSeparatorConnectionSizeAtStartRef.current,
                lowerSeparatorConnectionPixelsAtStart: lowerSeparatorConnectionPixelsAtStartRef.current,
                connectionLowerSeparatorMinPercent,
            });
            connectionResizeDraggingRef.current = false;
            connectionResizeStartSizeRef.current = null;
            connectionCollapsedAtResizeStartRef.current = false;
            connectionPendingExpandAfterDragRef.current = false;
            responseResizeDraggingRef.current = false;
            responseResizeStartSizeRef.current = null;
            frameRightResizeDraggingRef.current = false;
            frameListResizeStartSizeRef.current = null;
            frameDetailResizeStartSizeRef.current = null;
            sendResizeDraggingRef.current = false;
            sendResizeStartSizeRef.current = null;
            lowerSeparatorDragActiveRef.current = false;
            lowerSeparatorSendCollapsedAtStartRef.current = false;
            lowerSeparatorAllowConnectionCascadeRef.current = false;
            lowerSeparatorCascadeTriggeredRef.current = false;
            lowerSeparatorLockAfterSendCollapsedRef.current = false;
            lowerSeparatorHardLockedRef.current = false;
            lowerSeparatorLockedResponseSizeRef.current = null;
            lowerSeparatorConnectionSizeAtStartRef.current = null;
            lowerSeparatorConnectionPixelsAtStartRef.current = null;
            lowerSeparatorConnectionCollapsedAtStartRef.current = false;
            lowerSeparatorPendingConnectionExpandRef.current = false;
            lowerSeparatorLastPointerYRef.current = null;
            lowerSeparatorLastPointerTimeRef.current = null;
            lowerSeparatorSpeedEmaRef.current = null;
            lowerSeparatorUpwardTravelRef.current = 0;
            lowerSeparatorUpwardFastStreakRef.current = 0;
            setConnectionLowerSeparatorMinPercent(null);
            setConnectionLowerSeparatorLockActive(false);
            setLowerSeparatorDragInProgress(false);
            // Remove pointermove handler
            if (lowerSeparatorPointerMoveHandlerRef.current) {
                window.removeEventListener("pointermove", lowerSeparatorPointerMoveHandlerRef.current);
                lowerSeparatorPointerMoveHandlerRef.current = null;
            }
            if (wasLowerSeparatorDragActive) {
                if (shouldFinalizeConnectionCollapse) {
                    setConnectionPanelCollapsed(true);
                    collapseSourceRef.current = "drag";
                } else {
                    setConnectionPanelCollapsed(isConnectionPhysicallyCollapsedAtPointerUp);
                    collapseSourceRef.current = null;
                }
            }
        };
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
        window.addEventListener("blur", handlePointerUp);
        return () => {
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);
            window.removeEventListener("blur", handlePointerUp);
        };
    }, []);

    useEffect(() => {
        return () => {
            if (connectionExpandAnimationFrameRef.current !== null) {
                cancelAnimationFrame(connectionExpandAnimationFrameRef.current);
            }
            if (connectionCollapseAnimationFrameRef.current !== null) {
                cancelAnimationFrame(connectionCollapseAnimationFrameRef.current);
            }
            if (frameListExpandAnimationFrameRef.current !== null) {
                cancelAnimationFrame(frameListExpandAnimationFrameRef.current);
            }
            if (frameDetailExpandAnimationFrameRef.current !== null) {
                cancelAnimationFrame(frameDetailExpandAnimationFrameRef.current);
            }
            if (responseExpandAnimationFrameRef.current !== null) {
                cancelAnimationFrame(responseExpandAnimationFrameRef.current);
            }
                if (sendExpandAnimationFrameRef.current !== null) {
                    cancelAnimationFrame(sendExpandAnimationFrameRef.current);
                }
        };
    }, []);




    useEffect(() => {
        const clearPinnedOnClick = (event: MouseEvent) => {
            if (!statusPinnedRef.current) {
                return;
            }

            const selected = window.getSelection()?.toString().trim() ?? "";
            if (selected.length > 0) {
                return;
            }

            const target = event.target;
            if (target instanceof Element) {
                if (target.closest(".status-text")) {
                    return;
                }
            }

            clearPinnedStatus();
        };

        document.addEventListener("click", clearPinnedOnClick);
        return () => {
            document.removeEventListener("click", clearPinnedOnClick);
        };
    }, []);

    // RAF loop: poll pcmPlayer for smooth playback position in seconds
    useEffect(() => {
        const tick = () => {
            const player = pcmPlayerRef.current;
            if (player) {
                setPlaybackPositionSec(player.getPlaybackPositionSec());
                setPlaybackTotalDurationSec(player.getTotalEnqueuedDurationSec());
            } else {
                setPlaybackPositionSec(0);
                setPlaybackTotalDurationSec(0);
            }
            playbackPosRafRef.current = requestAnimationFrame(tick);
        };
        playbackPosRafRef.current = requestAnimationFrame(tick);
        return () => {
            if (playbackPosRafRef.current !== null) {
                cancelAnimationFrame(playbackPosRafRef.current);
                playbackPosRafRef.current = null;
            }
        };
    }, []);

    const handleToggleAutoPlayServerPCM = async (nextEnabled: boolean) => {
        setAutoPlayServerPCM(nextEnabled);
        if (!nextEnabled) {
            const player = pcmPlayerRef.current;
            if (player) {
                player.stopNow();
                setServerPCMPlaying(false);
                setPlaybackWaveform([]);
                setPlaybackPositionSec(0);
                setPlaybackTotalDurationSec(0);
                const playbackState = player.getPlaybackState();                setAudioProbe((prev) => ({
                    ...prev,
                    queueLength: playbackState.queueLength,
                    scheduledSources: playbackState.scheduledSources,
                    lastReason: "autoplay_off",
                }));
            }
            return;
        }
        if (!pcmPlayerRef.current) {
            pcmPlayerRef.current = createPCMPlayer();
        }
        try {
            await pcmPlayerRef.current.unlock();
        } catch {
            updateStatus("audio playback may be blocked by system policy; click speaker again after interaction");
        }
    };

    const handleAbortPlayback = () => {
        const player = pcmPlayerRef.current;
        if (!player) {
            return;
        }
        player.stopNow();
        setServerPCMPlaying(false);
        setPlaybackWaveform([]);
        setPlaybackPositionSec(0);
        setPlaybackTotalDurationSec(0);
        const playbackState = player.getPlaybackState();
        setAudioProbe((prev) => ({
            ...prev,
            queueLength: playbackState.queueLength,
            scheduledSources: playbackState.scheduledSources,
            lastReason: "manual_stop",
        }));
        updateStatus("playback aborted");
    };

    const playInboundAudioChunks = async (nextFrames: Frame[]) => {
        const newInboundFrames = nextFrames
            .filter((frame) => frame.direction === "in" && frame.id > lastPlayedInboundFrameIdRef.current)
            .sort((a, b) => a.id - b.id);

        if (newInboundFrames.length === 0) {
            return;
        }

        if (!autoPlayServerPCM) {
            lastPlayedInboundFrameIdRef.current = newInboundFrames[newInboundFrames.length - 1].id;
            setServerPCMPlaying(false);
            return;
        }

        if (!pcmPlayerRef.current) {
            pcmPlayerRef.current = createPCMPlayer();
        }

        let lastProcessedId = lastPlayedInboundFrameIdRef.current;
        let playedChunks = 0;
        let probeScanned = 0;
        let probeMatched = 0;
        let probeFailed = 0;
        let probeSkipped = 0;
        let lastReason = "";
        let lastOperationId = "";
        let lastDiagnostics: PCMChunkDiagnostics | null = null;
        const isProbeCandidateReason = (reason: string) => {
            return (
                reason.startsWith("matched_") ||
                reason.startsWith("invalid_interim_delta") ||
                reason.startsWith("invalid_result_audio") ||
                reason.startsWith("skip_empty_result_audio") ||
                reason.startsWith("skip_duplicate_result_audio_after_interim") ||
                reason.startsWith("not_assistant_audio(interim") ||
                reason.startsWith("not_assistant_audio(result")
            );
        };
        for (const frame of newInboundFrames) {
            lastProcessedId = frame.id;
            const extracted = extractPCMBase64FromInboundFrame(frame);
            lastReason = extracted.reason;
            lastOperationId = extracted.operationId ?? "";
            if (isProbeCandidateReason(extracted.reason)) {
                probeScanned += 1;
            }
            if (extracted.reason.startsWith("skip_")) {
                probeSkipped += 1;
            }
            const chunk = extracted.chunk;
            if (!chunk) {
                continue;
            }
            probeMatched += 1;
            try {
                lastDiagnostics = await pcmPlayerRef.current.enqueuePCM16Base64(chunk, serverPCMSampleRate, serverPCMChannels);
                if (lastDiagnostics) {
                    const slots = buildWaveformSlotsFromPCMBase64(chunk, serverPCMSampleRate, serverPCMChannels, 50);
                    const fallbackAmp = Math.sqrt(Math.max(0, Math.min(1, Math.max(lastDiagnostics.rms, lastDiagnostics.peak * 0.75))));
                    const fallbackCount = Math.max(1, Math.round(lastDiagnostics.durationMs / 50));
                    setPlaybackWaveform((prev) => {
                        const next = prev.slice();
                        if (slots.length > 0) {
                            for (let si = 0; si < slots.length; si += 1) next.push(slots[si]);
                        } else {
                            for (let si = 0; si < fallbackCount; si += 1) next.push(fallbackAmp);
                        }
                        return next;
                    });
                }
                if (extracted.eventName === "interim" && extracted.operationId) {
                    streamedAudioOperationIdsRef.current.add(extracted.operationId);
                }
                playedChunks += 1;
            } catch {
                // ignore single chunk decode/playback errors
                probeFailed += 1;
            }
        }
        lastPlayedInboundFrameIdRef.current = lastProcessedId;
        if (probeScanned > 0) {
            const playbackState = pcmPlayerRef.current?.getPlaybackState();
            setAudioProbe((prev) => ({
                scanned: prev.scanned + probeScanned,
                matched: prev.matched + probeMatched,
                failed: prev.failed + probeFailed,
                skipped: prev.skipped + probeSkipped,
                queueLength: playbackState?.queueLength ?? prev.queueLength,
                scheduledSources: playbackState?.scheduledSources ?? prev.scheduledSources,
                lastReason,
                lastOperationId,
                lastDurationMs: lastDiagnostics?.durationMs ?? prev.lastDurationMs,
                lastBytes: lastDiagnostics?.bytes ?? prev.lastBytes,
                lastRms: lastDiagnostics?.rms ?? prev.lastRms,
                lastPeak: lastDiagnostics?.peak ?? prev.lastPeak,
                lastBoundaryJump: lastDiagnostics?.boundaryJump ?? prev.lastBoundaryJump,
                lastSmoothingMs: lastDiagnostics?.smoothingMs ?? prev.lastSmoothingMs,
            }));
        }
        if (playedChunks > 0) {
            setServerPCMPlayedChunks((prev) => prev + playedChunks);
            setServerPCMPlaying(true);
            if (playbackPulseTimerRef.current) {
                clearTimeout(playbackPulseTimerRef.current);
            }
            playbackPulseTimerRef.current = setTimeout(() => {
                setServerPCMPlaying(false);
            }, 900);
        }
    };

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem("wavecat.savedConnections");
            if (raw) {
                const parsed = JSON.parse(raw) as Array<{
                    name: string;
                    url: string;
                    headersText: string;
                    queryParamsText: string;
                    subprotocol: string;
                }>;
                if (Array.isArray(parsed)) {
                    setSavedConnections(parsed);
                }
            }

            const rawDraft = window.localStorage.getItem("wavecat.lastDraftConfig");
            if (rawDraft) {
                const draft = JSON.parse(rawDraft) as Partial<LastDraftConfig>;
                if (typeof draft.url === "string") setUrl(draft.url);
                if (typeof draft.headersText === "string") setHeadersText(draft.headersText);
                if (typeof draft.queryParamsText === "string") setQueryParamsText(draft.queryParamsText);
                if (typeof draft.subprotocol === "string") setSubprotocol(draft.subprotocol);
                if (typeof draft.textPayload === "string") setTextPayload(draft.textPayload);
                if (typeof draft.binaryPayload === "string") setBinaryPayload(draft.binaryPayload);
                if (typeof draft.binaryFilePath === "string") setBinaryFilePath(draft.binaryFilePath);
                if (typeof draft.pcmFilePath === "string") setPcmFilePath(draft.pcmFilePath);
                if (typeof draft.sampleRate === "number" && Number.isFinite(draft.sampleRate)) setSampleRate(draft.sampleRate);
                if (typeof draft.channels === "number" && Number.isFinite(draft.channels)) setChannels(draft.channels);
                if (typeof draft.bitDepth === "number" && Number.isFinite(draft.bitDepth)) setBitDepth(draft.bitDepth);
                if (typeof draft.frameMs === "number" && Number.isFinite(draft.frameMs)) setFrameMs(draft.frameMs);
                if (typeof draft.seqStart === "number" && Number.isFinite(draft.seqStart)) setSeqStart(draft.seqStart);
                if (typeof draft.translationFromLanguage === "string") setTranslationFromLanguage(draft.translationFromLanguage);
                if (typeof draft.translationToLanguagesText === "string") setTranslationToLanguagesText(draft.translationToLanguagesText);
                if (draft.sessionProfile === "chat" || draft.sessionProfile === "translation") {
                    setSessionProfile(draft.sessionProfile);
                }
            }

            const rawTemplates = window.localStorage.getItem("wavecat.headerTemplates");
            if (rawTemplates) {
                const parsedTemplates = JSON.parse(rawTemplates) as Array<{
                    name: string;
                    seqStart: number;
                    headerRules: typeof headerRules;
                }>;
                if (Array.isArray(parsedTemplates)) {
                    setHeaderTemplates(parsedTemplates);
                }
            }

            const rawScrollPreset = window.localStorage.getItem("wavecat.scrollExpandPreset");
            if (rawScrollPreset === "sensitive" || rawScrollPreset === "stable") {
                setScrollExpandPreset(rawScrollPreset);
            }

            const rawAutoPlayServerPCM = window.localStorage.getItem("wavecat.autoPlayServerPCM");
            if (rawAutoPlayServerPCM === "true" || rawAutoPlayServerPCM === "false") {
                setAutoPlayServerPCM(rawAutoPlayServerPCM === "true");
            }

            const rawServerPCMSampleRate = Number(window.localStorage.getItem("wavecat.serverPCMSampleRate"));
            if (Number.isFinite(rawServerPCMSampleRate) && rawServerPCMSampleRate >= 8000 && rawServerPCMSampleRate <= 96000) {
                setServerPCMSampleRate(rawServerPCMSampleRate);
            }

            const rawServerPCMChannels = Number(window.localStorage.getItem("wavecat.serverPCMChannels"));
            if (rawServerPCMChannels === 1 || rawServerPCMChannels === 2) {
                setServerPCMChannels(rawServerPCMChannels);
            }

            const rawServerPCMMaxScheduledSources = Number(window.localStorage.getItem("wavecat.serverPCMMaxScheduledSources"));
            if (Number.isFinite(rawServerPCMMaxScheduledSources)) {
                const normalized = Math.max(1, Math.min(10, Math.floor(rawServerPCMMaxScheduledSources)));
                setServerPCMMaxScheduledSources(normalized);
            }

            const rawServerPCMMinStartBufferMs = Number(window.localStorage.getItem("wavecat.serverPCMMinStartBufferMs"));
            if (Number.isFinite(rawServerPCMMinStartBufferMs)) {
                const normalized = Math.max(40, Math.min(400, Math.floor(rawServerPCMMinStartBufferMs)));
                setServerPCMMinStartBufferMs(normalized);
            }

            const rawServerPCMCrossfadeMs = Number(window.localStorage.getItem("wavecat.serverPCMCrossfadeMs"));
            if (Number.isFinite(rawServerPCMCrossfadeMs)) {
                const normalized = Math.max(0, Math.min(12, rawServerPCMCrossfadeMs));
                setServerPCMCrossfadeMs(normalized);
            }

            const rawServerPCMAdaptiveRateEnabled = window.localStorage.getItem("wavecat.serverPCMAdaptiveRateEnabled");
            if (rawServerPCMAdaptiveRateEnabled === "true" || rawServerPCMAdaptiveRateEnabled === "false") {
                setServerPCMAdaptiveRateEnabled(rawServerPCMAdaptiveRateEnabled === "true");
            }

            const rawServerPCMAdaptiveRateStrength = Number(window.localStorage.getItem("wavecat.serverPCMAdaptiveRateStrength"));
            if (Number.isFinite(rawServerPCMAdaptiveRateStrength)) {
                const normalized = Math.max(0, Math.min(2, rawServerPCMAdaptiveRateStrength));
                setServerPCMAdaptiveRateStrength(normalized);
            }

            const rawLowerSeparatorPointerSpeedAdjustableThreshold = Number(
                window.localStorage.getItem("wavecat.lowerSeparatorPointerSpeedAdjustableThreshold")
            );
            if (Number.isFinite(rawLowerSeparatorPointerSpeedAdjustableThreshold)) {
                const normalized = Math.max(0.2, Math.min(4, rawLowerSeparatorPointerSpeedAdjustableThreshold));
                setLowerSeparatorPointerSpeedAdjustableThreshold(normalized);
            }

            const rawLowerSeparatorPointerMinTriggerSpeed = Number(
                window.localStorage.getItem("wavecat.lowerSeparatorPointerMinTriggerSpeed")
            );
            if (Number.isFinite(rawLowerSeparatorPointerMinTriggerSpeed)) {
                const normalized = Math.max(0.1, Math.min(2.5, rawLowerSeparatorPointerMinTriggerSpeed));
                setLowerSeparatorPointerMinTriggerSpeed(normalized);
            }
        } catch {
            // ignore localStorage parse errors
        }

        const timer = window.setInterval(async () => {
            if (inFlightRef.current) {
                return;
            }
            inFlightRef.current = true;

            try {
                const [nextStatus, nextFrames, nextStreamStatus] = await Promise.all([
                    wsStatus(),
                    wsGetFrames(),
                    wsPCMStreamStatus(),
                ]);
                const statusLabel = nextStatus.error ? `${nextStatus.state} | ${nextStatus.error}` : nextStatus.state;
                if (!sessionRunnerRef.current && !pendingResponseRef.current && lastStatusRef.current !== statusLabel) {
                    updateStatus(statusLabel);
                }

                setStreamStatus(nextStreamStatus);
                setStreaming(nextStreamStatus.running);
                setMicStreaming(nextStreamStatus.running && nextStreamStatus.filePath === "[microphone]");
                if (pcmPlayerRef.current) {
                    const playbackState = pcmPlayerRef.current.getPlaybackState();
                    setAudioProbe((prev) => ({
                        ...prev,
                        queueLength: playbackState.queueLength,
                        scheduledSources: playbackState.scheduledSources,
                    }));
                }

                setConnected((prev) => {
                    const next = nextStatus.state === "connected";
                    return prev === next ? prev : next;
                });
                if (nextStatus.state !== "connected") {
                    setStreaming(false);
                    setMicStreaming(false);
                    resetMicVisuals();
                    clearPendingResponse();
                    if (!sessionRunnerRef.current && lastStatusRef.current !== statusLabel) {
                        updateStatus(statusLabel);
                    }
                }

                const last = nextFrames[nextFrames.length - 1];
                const frameSig = `${nextFrames.length}:${last?.id ?? 0}:${last?.timestamp ?? 0}`;
                if (lastFrameSigRef.current !== frameSig) {
                    lastFrameSigRef.current = frameSig;
                    setFrames(nextFrames);
                    await playInboundAudioChunks(nextFrames);
                    processInboundTextChunks(nextFrames);

                    if (pendingResponseRef.current) {
                        const latestIncoming = [...nextFrames]
                            .reverse()
                            .find((frame) => frame.direction === "in" && frame.id > pendingAfterIdRef.current);
                        if (latestIncoming) {
                            clearPendingResponse();
                            updateStatus("response received");
                        }
                    }
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                updateStatus(message);
            } finally {
                inFlightRef.current = false;
            }
        }, 800);

        return () => {
            window.clearInterval(timer);
            clearPendingResponse();
            void releaseMicCapture();
        };
    }, []);

    useEffect(() => {
        window.localStorage.setItem("wavecat.scrollExpandPreset", scrollExpandPreset);
    }, [scrollExpandPreset]);

    useEffect(() => {
        window.localStorage.setItem("wavecat.autoPlayServerPCM", String(autoPlayServerPCM));
    }, [autoPlayServerPCM]);

    useEffect(() => {
        window.localStorage.setItem("wavecat.serverPCMSampleRate", String(serverPCMSampleRate));
    }, [serverPCMSampleRate]);

    useEffect(() => {
        window.localStorage.setItem("wavecat.serverPCMChannels", String(serverPCMChannels));
    }, [serverPCMChannels]);

    useEffect(() => {
        window.localStorage.setItem("wavecat.serverPCMMaxScheduledSources", String(serverPCMMaxScheduledSources));
    }, [serverPCMMaxScheduledSources]);

    useEffect(() => {
        window.localStorage.setItem("wavecat.serverPCMMinStartBufferMs", String(serverPCMMinStartBufferMs));
    }, [serverPCMMinStartBufferMs]);

    useEffect(() => {
        window.localStorage.setItem("wavecat.serverPCMCrossfadeMs", String(serverPCMCrossfadeMs));
    }, [serverPCMCrossfadeMs]);

    useEffect(() => {
        window.localStorage.setItem("wavecat.serverPCMAdaptiveRateEnabled", String(serverPCMAdaptiveRateEnabled));
    }, [serverPCMAdaptiveRateEnabled]);

    useEffect(() => {
        window.localStorage.setItem("wavecat.serverPCMAdaptiveRateStrength", String(serverPCMAdaptiveRateStrength));
    }, [serverPCMAdaptiveRateStrength]);

    useEffect(() => {
        window.localStorage.setItem(
            "wavecat.lowerSeparatorPointerSpeedAdjustableThreshold",
            String(lowerSeparatorPointerSpeedAdjustableThreshold)
        );
    }, [lowerSeparatorPointerSpeedAdjustableThreshold]);

    useEffect(() => {
        window.localStorage.setItem("wavecat.lowerSeparatorPointerMinTriggerSpeed", String(lowerSeparatorPointerMinTriggerSpeed));
    }, [lowerSeparatorPointerMinTriggerSpeed]);

    useEffect(() => {
        const draft: LastDraftConfig = {
            url,
            headersText,
            queryParamsText,
            subprotocol,
            textPayload,
            binaryPayload,
            binaryFilePath,
            pcmFilePath,
            sampleRate,
            channels,
            bitDepth,
            frameMs,
            seqStart,
            translationFromLanguage,
            translationToLanguagesText,
            sessionProfile,
        };
        window.localStorage.setItem("wavecat.lastDraftConfig", JSON.stringify(draft));
    }, [
        url,
        headersText,
        queryParamsText,
        subprotocol,
        textPayload,
        binaryPayload,
        binaryFilePath,
        pcmFilePath,
        sampleRate,
        channels,
        bitDepth,
        frameMs,
        seqStart,
        translationFromLanguage,
        translationToLanguagesText,
        sessionProfile,
    ]);

    useEffect(() => {
        if (autoPlayServerPCM) {
            return;
        }
        setServerPCMPlaying(false);
    }, [autoPlayServerPCM]);

    useEffect(() => {
        if (!autoPlayServerPCM) {
            return;
        }

        const tryUnlock = async () => {
            if (!pcmPlayerRef.current) {
                pcmPlayerRef.current = createPCMPlayer();
            }
            try {
                await pcmPlayerRef.current.unlock();
            } catch {
                // 自动播放策略可能阻止，等待后续用户交互再次尝试
            }
        };

        const onGesture = () => {
            void tryUnlock();
        };

        document.addEventListener("pointerdown", onGesture);
        document.addEventListener("keydown", onGesture);
        return () => {
            document.removeEventListener("pointerdown", onGesture);
            document.removeEventListener("keydown", onGesture);
        };
    }, [autoPlayServerPCM]);

    useEffect(() => {
        if (!settingsOpen && !probeDetailsOpen) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            const root = settingsRef.current;
            const target = event.target as Node | null;
            if (!root || !target || root.contains(target)) {
                return;
            }
            setSettingsOpen(false);
            setProbeDetailsOpen(false);
        };

        document.addEventListener("pointerdown", handlePointerDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
        };
    }, [settingsOpen, probeDetailsOpen]);

    useEffect(() => {
        if (formatTimerRef.current) {
            clearTimeout(formatTimerRef.current);
            formatTimerRef.current = null;
        }

        const trimmed = textPayload.trim();
        if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
            return;
        }

        formatTimerRef.current = setTimeout(() => {
            const formatted = tryFormatJSON(textPayload);
            if (formatted && formatted !== textPayload) {
                setTextPayload(formatted);
            }
        }, 450);

        return () => {
            if (formatTimerRef.current) {
                clearTimeout(formatTimerRef.current);
                formatTimerRef.current = null;
            }
        };
    }, [textPayload]);

    const selectedFrame = useMemo(
        () => frames.find((frame) => frame.id === selectedId),
        [frames, selectedId]
    );

    const latestInboundFrame = useMemo(
        () => [...frames].reverse().find((frame) => frame.direction === "in"),
        [frames]
    );

    const parseStringMap = (raw: string, label: string): Record<string, string> => {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error(`${label} 必须是 JSON 对象`);
        }
        return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>(
            (acc, [key, value]) => {
                acc[key] = String(value);
                return acc;
            },
            {}
        );
    };

    const parseHeaders = (): Record<string, string> => parseStringMap(headersText, "Headers");
    const parseQueryParams = (): Record<string, string> => parseStringMap(queryParamsText, "Query Params");

    const syncFramesNow = async () => {
        const nextFrames = await wsGetFrames();
        setFrames(nextFrames);
        const last = nextFrames[nextFrames.length - 1];
        const frameSig = `${nextFrames.length}:${last?.id ?? 0}:${last?.timestamp ?? 0}`;
        lastFrameSigRef.current = frameSig;
        return { nextFrames, last };
    };

    const handleConnect = async () => {
        try {
            const currentStatus = await wsStatus();
            if (currentStatus.state === "connected") {
                setConnected(true);
                if (!sessionRunnerRef.current && !pendingResponseRef.current) {
                    updateStatus("already connected");
                }
                return;
            }

            const result = await wsConnect({
                url,
                headers: parseHeaders(),
                queryParams: parseQueryParams(),
                subprotocol: subprotocol.trim(),
            });
            updateStatus(result.message);
            if (result.success) {
                setConnected(true);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            updateStatus(message);
        }
    };

    const handleUseSavedConnection = (index: number) => {
        const item = savedConnections[index];
        if (!item) {
            return;
        }
        setUrl(item.url);
        setHeadersText(item.headersText);
        setQueryParamsText(item.queryParamsText ?? "{}");
        setSubprotocol(item.subprotocol);
        updateStatus(`loaded saved connection: ${item.name}`);
    };

    const handleSaveCurrentConnection = () => {
        const name = url.trim() || `connection-${savedConnections.length + 1}`;
        const next = [
            { name, url: url.trim(), headersText, queryParamsText, subprotocol: subprotocol.trim() },
            ...savedConnections.filter((item) => item.url !== url.trim() || item.subprotocol !== subprotocol.trim()),
        ].slice(0, 8);
        setSavedConnections(next);
        window.localStorage.setItem("wavecat.savedConnections", JSON.stringify(next));
        updateStatus("connection saved");
    };

    const handleReconnect = async () => {
        if (connected) {
            await handleDisconnect();
        }
        await handleConnect();
    };

    const handleDisconnect = async () => {
        const result = await wsDisconnect();
        await releaseMicCapture();
        clearPendingResponse();
        updateStatus(result.message);
        setStreaming(false);
        resetMicVisuals();
        setPlaybackWaveform([]);
        setPlaybackPositionSec(0);
        setPlaybackTotalDurationSec(0);
        lastPlayedInboundFrameIdRef.current = 0;
        lastProcessedTextFrameIdRef.current = 0;
        setLiveAssistantText("");
        streamedAudioOperationIdsRef.current.clear();
        setAudioProbe({ scanned: 0, matched: 0, failed: 0, skipped: 0, queueLength: 0, scheduledSources: 0, lastReason: "", lastOperationId: "", lastDurationMs: 0, lastBytes: 0, lastRms: 0, lastPeak: 0, lastBoundaryJump: 0, lastSmoothingMs: 0 });
    };

    const handlePing = async () => {
        const result = await wsPing();
        updateStatus(result.message);
    };

    const handleClear = async () => {
        await wsClearFrames();
        setSelectedId(null);
        collapseFrameDetailPanel();
        resetMicVisuals();
        setPlaybackWaveform([]);
        setPlaybackPositionSec(0);
        setPlaybackTotalDurationSec(0);
        lastPlayedInboundFrameIdRef.current = 0;
        lastProcessedTextFrameIdRef.current = 0;
        setLiveAssistantText("");
        streamedAudioOperationIdsRef.current.clear();
        setAudioProbe({ scanned: 0, matched: 0, failed: 0, skipped: 0, queueLength: 0, scheduledSources: 0, lastReason: "", lastOperationId: "", lastDurationMs: 0, lastBytes: 0, lastRms: 0, lastPeak: 0, lastBoundaryJump: 0, lastSmoothingMs: 0 });
    };

    const applyJSONVariables = (raw: string) => {
        const now = Date.now();
        const conversationId = jsonVariableContext.conversationId || "test";
        const streamId = jsonVariableContext.streamId || 6;
        const operationId = `op-${now}`;
        const messageId = `msg-${now}`;
        const replaced = raw
            .replaceAll("${message_id}", messageId)
            .replaceAll("${operation_id}", operationId)
            .replaceAll("${conversation_id}", conversationId)
            .replaceAll("${stream_id}", String(streamId))
            .replaceAll("${created_at}", String(now));
        setJSONVariableContext({ conversationId, streamId });
        return replaced;
    };

    const handleApplyJSONTemplate = (template: string) => {
        if (template === "translation_start") {
            setTextPayload(buildTranslationStartTemplate());
            return;
        }
        if (template === "translation_close") {
            setTextPayload(`{\n  "message_id": "${"${message_id}"}",\n  "operation_id": "${"${operation_id}"}",\n  "conversation_id": "${"${conversation_id}"}",\n  "stream_id": ${"${stream_id}"},\n  "type": "translation",\n  "event": "close_session",\n  "payload": {},\n  "created_at": ${"${created_at}"}\n}`);
            return;
        }
        if (template === "chat_start") {
            setTextPayload(`{\n  "message_id": "${"${message_id}"}",\n  "conversation_id": "${"${conversation_id}"}",\n  "stream_id": ${"${stream_id}"},\n  "type": "chat",\n  "event": "start",\n  "payload": {\n    "instructions": "你是简洁可靠的中文语音助手，优先直接回答用户问题。",\n    "output_mode": "text_audio"\n  },\n  "created_at": ${"${created_at}"}\n}`);
            return;
        }
        if (template === "chat_close") {
            setTextPayload(`{\n  "message_id": "${"${message_id}"}",\n  "conversation_id": "${"${conversation_id}"}",\n  "stream_id": ${"${stream_id}"},\n  "type": "chat",\n  "event": "close_session",\n  "payload": {},\n  "created_at": ${"${created_at}"}\n}`);
        }
    };

    const handleSendText = async () => {
        const injected = applyJSONVariables(textPayload);
        const payload = tryFormatJSON(injected) ?? injected;
        if (payload !== textPayload) {
            setTextPayload(payload);
        }

        const result = await wsSendText(payload);
        if (!result.success) {
            updateStatus(result.message);
            return;
        }
        const { last } = await syncFramesNow();
        beginPendingResponse(last?.id ?? 0);
    };

    const handleSendBinary = async () => {
        const result = await wsSendBinaryBase64(binaryPayload.trim());
        if (!result.success) {
            updateStatus(result.message);
            return;
        }
        const { last } = await syncFramesNow();
        beginPendingResponse(last?.id ?? 0);
    };

    const handlePickBinaryFile = async () => {
        try {
            const result = await wsPickBinaryFile();
            if (result.success && result.path) {
                setBinaryFilePath(result.path);
                updateStatus("binary file selected");
                return;
            }
            updateStatus(result.message);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            updateStatus(message);
        }
    };

    const handleSendBinaryFile = async () => {
        const result = await wsSendBinaryFile(binaryFilePath.trim());
        if (!result.success) {
            updateStatus(result.message);
            return;
        }
        const { last } = await syncFramesNow();
        beginPendingResponse(last?.id ?? 0);
    };

    const handleStartStream = async () => {
        try {
            const resolvedConfig = await resolveAudioRunConfig({
                profileType: sessionProfile,
                filePath: pcmFilePath.trim(),
                sampleRate,
                channels,
                bitDepth,
                frameMs,
                seqStart,
                headerRules,
            });
            const result = await wsStartPCMStream({
                filePath: resolvedConfig.filePath,
                sampleRate: resolvedConfig.sampleRate,
                channels: resolvedConfig.channels,
                bitDepth: resolvedConfig.bitDepth,
                frameMs: resolvedConfig.frameMs,
                seqStart: resolvedConfig.seqStart,
                headerRules: resolvedConfig.headerRules,
            });
            updateStatus(result.message);
            setStreaming(result.success);
            setStreamStatus({
                running: result.success,
                filePath: resolvedConfig.filePath,
                frameBytes: 0,
                frameMs: resolvedConfig.frameMs,
                sentFrames: 0,
                sentBytes: 0,
                lastError: "",
                finishReason: "",
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            updateStatus(message);
            setStreaming(false);
        }
    };

    const handlePickPcmFile = async () => {
        try {
            const result = await wsPickPCMFile();
            if (result.success && result.path) {
                setPcmFilePath(result.path);
                await inspectAudioFile(result.path, true);
                return;
            }
            updateStatus(result.message);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            updateStatus(message);
        }
    };

    const handleSaveHeaderTemplate = () => {
        const name = window.prompt("输入模板名称", `header-template-${headerTemplates.length + 1}`)?.trim();
        if (!name) {
            return;
        }
        const next = [
            { name, seqStart, headerRules },
            ...headerTemplates.filter((item) => item.name !== name),
        ].slice(0, 20);
        setHeaderTemplates(next);
        window.localStorage.setItem("wavecat.headerTemplates", JSON.stringify(next));
        updateStatus("header template saved");
    };

    const handleApplyMiniTranslationPreset = () => {
        setSampleRate(16000);
        setChannels(1);
        setBitDepth(16);
        setFrameMs(20);
        setSeqStart(1);
        setAudioParamSource("Mini Translation preset");
        setHeaderConfigSource("Mini Translation preset");
        setHeaderRules(cloneMiniTranslationHeaderPreset());
        updateStatus("mini translation preset applied");
    };

    const inspectAudioFile = async (filePath: string, shouldUpdateStatus: boolean) => {
        const info = await wsInspectAudioFile(filePath.trim());
        setAudioFileInfo(info);
        if (!info.success) {
            throw new Error(info.message || "inspect audio file failed");
        }
        if (info.format === "wav") {
            if (info.sampleRate > 0) {
                setSampleRate(info.sampleRate);
            }
            if (info.channels > 0) {
                setChannels(info.channels);
            }
            if (info.bitDepth > 0) {
                setBitDepth(info.bitDepth);
            }
            setAudioParamSource("WAV auto-detected");
            if (shouldUpdateStatus) {
                updateStatus(`wav detected: ${info.sampleRate}Hz / ${info.channels}ch / ${info.bitDepth}bit`);
            }
            return info;
        }
        setAudioParamSource("Manual");
        if (shouldUpdateStatus) {
            updateStatus(info.message || "audio file selected");
        }
        return info;
    };

    const resolveAudioRunConfig = async (config: SessionRunConfig): Promise<SessionRunConfig> => {
        const resolved = {
            ...config,
            filePath: config.filePath.trim(),
            headerRules: config.headerRules.map((rule) => ({ ...rule })),
        };
        if (!resolved.filePath) {
            throw new Error("audio file path 不能为空");
        }
        if (!resolved.filePath.toLowerCase().endsWith(".wav")) {
            return resolved;
        }
        const info = await inspectAudioFile(resolved.filePath, false);
        return {
            ...resolved,
            sampleRate: info.sampleRate > 0 ? info.sampleRate : resolved.sampleRate,
            channels: info.channels > 0 ? info.channels : resolved.channels,
            bitDepth: info.bitDepth > 0 ? info.bitDepth : resolved.bitDepth,
        };
    };

    const applyMiniTranslationState = () => {
        setSessionProfile("translation");
        setSampleRate(16000);
        setChannels(1);
        setBitDepth(16);
        setFrameMs(20);
        setSeqStart(1);
        setAudioParamSource("Mini Translation preset");
        setHeaderConfigSource("Mini Translation preset");
        setHeaderRules(cloneMiniTranslationHeaderPreset());
        setTextPayload(buildSessionTemplate("translation", "start"));
    };

    const handleLoadHeaderTemplate = (index: number) => {
        const template = headerTemplates[index];
        if (!template) {
            return;
        }
        setSeqStart(template.seqStart ?? 0);
        setHeaderConfigSource(`Saved template: ${template.name}`);
        setHeaderRules(template.headerRules ?? []);
        updateStatus(`header template loaded: ${template.name}`);
    };

    const handleRenameHeaderTemplate = (index: number) => {
        const template = headerTemplates[index];
        if (!template) {
            return;
        }
        const name = window.prompt("输入新的模板名称", template.name)?.trim();
        if (!name) {
            return;
        }
        const next = headerTemplates.map((item, idx) => (idx === index ? { ...item, name } : item));
        setHeaderTemplates(next);
        window.localStorage.setItem("wavecat.headerTemplates", JSON.stringify(next));
        updateStatus("header template renamed");
    };

    const handleDeleteHeaderTemplate = (index: number) => {
        const template = headerTemplates[index];
        if (!template) {
            return;
        }
        const confirmed = window.confirm(`确认删除模板 ${template.name} 吗？`);
        if (!confirmed) {
            return;
        }
        const next = headerTemplates.filter((_, idx) => idx !== index);
        setHeaderTemplates(next);
        window.localStorage.setItem("wavecat.headerTemplates", JSON.stringify(next));
        updateStatus("header template deleted");
    };

    const waitForInboundEvent = async (
        matcher: (text: string) => boolean,
        timeoutMs: number,
        afterId = 0,
        onPoll?: (frames: Frame[]) => void
    ) => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const nextFrames = await wsGetFrames();
            const matched = [...nextFrames]
                .reverse()
                .find(
                    (frame) =>
                        frame.direction === "in" &&
                        frame.id > afterId &&
                        typeof frame.text === "string" &&
                        matcher(frame.text)
                );
            const last = nextFrames[nextFrames.length - 1];
            setFrames(nextFrames);
            onPoll?.(nextFrames);
            if (matched) {
                return matched;
            }
            await new Promise((resolve) => window.setTimeout(resolve, 300));
        }
        throw new Error(`wait event timeout after ${timeoutMs}ms`);
    };

    const waitForPCMStreamFinished = async (timeoutMs: number) => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const nextStreamStatus = await wsPCMStreamStatus();
            setStreamStatus(nextStreamStatus);
            setStreaming(nextStreamStatus.running);
            if (!nextStreamStatus.running) {
                return nextStreamStatus;
            }
            await new Promise((resolve) => window.setTimeout(resolve, 300));
        }
        throw new Error(`wait pcm stream finish timeout after ${timeoutMs}ms`);
    };

    const isTranslationEvent = (text: string, eventNames: string[]) => {
        try {
            const parsed = JSON.parse(text) as {
                type?: unknown;
                event?: unknown;
                payload?: { event?: unknown; status?: unknown; is_final?: unknown; result_type?: unknown };
                is_final?: unknown;
                result_type?: unknown;
                status?: unknown;
            };
            if (parsed.type !== "translation") {
                return false;
            }
            const candidates = [
                parsed.event,
                parsed.status,
                parsed.result_type,
                parsed.payload?.event,
                parsed.payload?.status,
                parsed.payload?.result_type,
            ]
                .filter((value): value is string => typeof value === "string")
                .map((value) => value.toLowerCase());
            if (eventNames.some((name) => candidates.includes(name.toLowerCase()))) {
                return true;
            }
            const wantsFinal = eventNames.some((name) => ["completed", "complete", "final", "finished"].includes(name));
            if (wantsFinal && (parsed.is_final === true || parsed.payload?.is_final === true)) {
                return true;
            }
            return false;
        } catch {
            const normalized = text.replaceAll(" ", "").toLowerCase();
            return (
                normalized.includes('"type":"translation"') &&
                eventNames.some(
                    (name) =>
                        normalized.includes(`"event":"${name.toLowerCase()}"`) ||
                        normalized.includes(`"status":"${name.toLowerCase()}"`) ||
                        normalized.includes(`"result_type":"${name.toLowerCase()}"`)
                )
            );
        }
    };

    const isChatEvent = (text: string, eventNames: string[]) => {
        try {
            const parsed = JSON.parse(text) as {
                type?: unknown;
                event?: unknown;
                payload?: { event?: unknown; status?: unknown };
                status?: unknown;
            };
            if (parsed.type !== "chat") {
                return false;
            }
            const candidates = [parsed.event, parsed.status, parsed.payload?.event, parsed.payload?.status]
                .filter((value): value is string => typeof value === "string")
                .map((value) => value.toLowerCase());
            return eventNames.some((name) => candidates.includes(name.toLowerCase()));
        } catch {
            const normalized = text.replaceAll(" ", "").toLowerCase();
            return (
                normalized.includes('"type":"chat"') &&
                eventNames.some(
                    (name) =>
                        normalized.includes(`"event":"${name.toLowerCase()}"`) ||
                        normalized.includes(`"status":"${name.toLowerCase()}"`)
                )
            );
        }
    };

    const extractTranslationText = (text: string) => {
        try {
            const parsed = JSON.parse(text) as {
                text?: unknown;
                translation?: unknown;
                result?: unknown;
                payload?: unknown;
                data?: unknown;
            };

            const candidates: unknown[] = [parsed.text, parsed.translation, parsed.result, parsed.payload, parsed.data];

            const walk = (value: unknown): string => {
                if (typeof value === "string") {
                    return value;
                }
                if (Array.isArray(value)) {
                    return value.map((item) => walk(item)).filter(Boolean).join("\n");
                }
                if (value && typeof value === "object") {
                    const record = value as Record<string, unknown>;
                    const directKeys = ["text", "translation", "translated_text", "transcript", "content", "message", "sentence"];
                    for (const key of directKeys) {
                        if (typeof record[key] === "string" && String(record[key]).trim()) {
                            return String(record[key]);
                        }
                    }
                    const nestedKeys = ["results", "translations", "segments", "items", "alternatives", "payload", "data", "result"];
                    for (const key of nestedKeys) {
                        const nested = walk(record[key]);
                        if (nested) {
                            return nested;
                        }
                    }
                }
                return "";
            };

            for (const candidate of candidates) {
                const extracted = walk(candidate);
                if (extracted) {
                    return extracted;
                }
            }
            return "";
        } catch {
            return "";
        }
    };

    const matchesSessionEvent = (text: string, profileType: SessionProfileType, eventNames: string[]) => {
        if (profileType === "translation") {
            return isTranslationEvent(text, eventNames);
        }
        return isChatEvent(text, eventNames);
    };

    const isTranslationFinalFrame = (text: string) => {
        try {
            const parsed = JSON.parse(text) as {
                type?: unknown;
                event?: unknown;
                payload?: { reason?: unknown };
            };
            if (parsed.type !== "translation") {
                return false;
            }
            if (parsed.event === "result") {
                return true;
            }
            if (parsed.event === "completed") {
                const reason = typeof parsed.payload?.reason === "string" ? parsed.payload.reason : "";
                return reason !== "audio_end" && reason !== "audio_stop";
            }
            return false;
        } catch {
            return isTranslationEvent(text, ["completed", "complete", "final", "finished"]);
        }
    };

    const isChatAudioDeltaFrame = (text: string) => {
        try {
            const parsed = JSON.parse(text) as {
                type?: unknown;
                event?: unknown;
                payload?: { role?: unknown; content_type?: unknown; delta?: unknown };
            };
            return (
                parsed.type === "chat" &&
                parsed.event === "interim" &&
                parsed.payload?.content_type === "audio" &&
                (parsed.payload?.role === "assistant" || parsed.payload?.role === undefined || parsed.payload?.role === null || parsed.payload?.role === "") &&
                typeof parsed.payload?.delta === "string" &&
                parsed.payload.delta.length > 0
            );
        } catch {
            return false;
        }
    };

    const isChatFinalFrame = (text: string) => {
        try {
            const parsed = JSON.parse(text) as {
                type?: unknown;
                event?: unknown;
                status?: unknown;
            };
            if (parsed.type !== "chat") {
                return false;
            }
            const eventStr = typeof parsed.event === "string" ? parsed.event.toLowerCase() : "";
            if (["result", "completed", "final", "finished"].includes(eventStr)) {
                return true;
            }
            return false;
        } catch {
            return isChatEvent(text, ["result", "completed", "final", "finished"]);
        }
    };

    const estimateBase64DecodedBytes = (base64: string) => {
        const normalized = base64.replace(/\s/g, "");
        if (!normalized) {
            return 0;
        }
        const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
        return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
    };

    const buildSessionTemplate = (profileType: SessionProfileType, phase: "start" | "close") => {
        if (profileType === "chat") {
            if (phase === "start") {
                return `{
  "message_id": "${"${message_id}"}",
  "conversation_id": "${"${conversation_id}"}",
  "stream_id": ${"${stream_id}"},
  "type": "chat",
  "event": "start",
  "payload": {
        "instructions": "你是简洁可靠的中文语音助手，优先直接回答用户问题。",
        "output_mode": "text_audio"
  },
  "created_at": ${"${created_at}"}
}`;
            }
            return `{
  "message_id": "${"${message_id}"}",
  "conversation_id": "${"${conversation_id}"}",
  "stream_id": ${"${stream_id}"},
  "type": "chat",
  "event": "close_session",
  "payload": {},
  "created_at": ${"${created_at}"}
}`;
        }
        if (phase === "start") {
            return buildTranslationStartTemplate();
        }
        return `{
  "message_id": "${"${message_id}"}",
  "operation_id": "${"${operation_id}"}",
  "conversation_id": "${"${conversation_id}"}",
  "stream_id": ${"${stream_id}"},
  "type": "translation",
  "event": "close_session",
  "payload": {},
  "created_at": ${"${created_at}"}
}`;
    };

    const runSessionFlow = async (baseConfig: SessionRunConfig) => {
        if (sessionRunnerRef.current) {
            return;
        }
        const sessionConfig = await resolveAudioRunConfig(baseConfig);
        sessionRunnerRef.current = true;
        sessionStatusRef.current = "";
        setSessionSummary({
            profileType: sessionConfig.profileType,
            status: "starting",
            extractedText: "",
            extractedAudioChunks: 0,
            extractedAudioBytes: 0,
            error: "",
        });
        try {
            const connectionStatus = await wsStatus();
            if (connectionStatus.state !== "connected") {
                await handleConnect();
                const connectedStatus = await wsStatus();
                if (connectedStatus.state !== "connected") {
                    throw new Error(connectedStatus.error || `连接失败: ${connectedStatus.state}`);
                }
            }

            const startSnapshot = await wsGetFrames();
            const startAfterId = startSnapshot[startSnapshot.length - 1]?.id ?? 0;

            const startTemplate = buildSessionTemplate(sessionConfig.profileType, "start");
            const injectedStartPayload = applyJSONVariables(startTemplate);
            const startPayload = tryFormatJSON(injectedStartPayload) ?? injectedStartPayload;
            setTextPayload(startPayload);
            const startResult = await wsSendText(startPayload);
            if (!startResult.success) {
                throw new Error(startResult.message);
            }

            updateStatus(`waiting ${sessionConfig.profileType}/started...`);
            setSessionSummary({
                profileType: sessionConfig.profileType,
                status: "waiting_started",
                extractedText: "",
                extractedAudioChunks: 0,
                extractedAudioBytes: 0,
                error: "",
            });
            const startedFrame = await waitForInboundEvent(
                (text) => matchesSessionEvent(text, sessionConfig.profileType, ["started", "start", "session_started"]),
                15000,
                startAfterId
            );

            const streamStartResult = await wsStartPCMStream({
                filePath: sessionConfig.filePath,
                sampleRate: sessionConfig.sampleRate,
                channels: sessionConfig.channels,
                bitDepth: sessionConfig.bitDepth,
                frameMs: sessionConfig.frameMs,
                seqStart: sessionConfig.seqStart,
                headerRules: sessionConfig.headerRules,
            });
            if (!streamStartResult.success) {
                throw new Error(streamStartResult.message);
            }
            setStreaming(true);
            setSessionSummary({
                profileType: sessionConfig.profileType,
                status: "streaming",
                startedFrame,
                extractedText: "",
                extractedAudioChunks: 0,
                extractedAudioBytes: 0,
                error: "",
            });
            updateStatus("streaming pcm...");

            const finishedStreamStatus = await waitForPCMStreamFinished(10 * 60 * 1000);
            if (finishedStreamStatus.lastError) {
                throw new Error(finishedStreamStatus.lastError);
            }

            updateStatus(`waiting ${sessionConfig.profileType} final/completed...`);
            let extractedAudioChunks = 0;
            let extractedAudioBytes = 0;
            setSessionSummary({
                profileType: sessionConfig.profileType,
                status: "waiting_final",
                startedFrame,
                extractedText: "",
                extractedAudioChunks: 0,
                extractedAudioBytes: 0,
                error: "",
            });
            const countAudioDeltas = (polledFrames: Frame[]) => {
                const audioDeltas = polledFrames.filter(
                    (f) => f.direction === "in" && f.id >= startedFrame.id && isChatAudioDeltaFrame(f.text ?? "")
                );
                const chunks = audioDeltas.length;
                const bytes = audioDeltas.reduce((sum, f) => {
                    try {
                        const p = JSON.parse(f.text ?? "") as { payload?: { delta?: unknown } };
                        return sum + (typeof p.payload?.delta === "string" ? estimateBase64DecodedBytes(p.payload.delta) : 0);
                    } catch {
                        return sum;
                    }
                }, 0);
                return { chunks, bytes };
            };

            const finalFrame = await waitForInboundEvent(
                (text) => {
                    if (sessionConfig.profileType === "translation") {
                        return isTranslationFinalFrame(text);
                    }
                    return isChatFinalFrame(text);
                },
                30000,
                startedFrame.id,
                sessionConfig.profileType === "chat"
                    ? (polledFrames) => {
                          const { chunks, bytes } = countAudioDeltas(polledFrames);
                          setSessionSummary((prev) => ({
                              ...prev,
                              extractedAudioChunks: chunks,
                              extractedAudioBytes: bytes,
                          }));
                      }
                    : undefined
            );
            const extractedText = finalFrame.text ? extractTranslationText(finalFrame.text) : "";

            if (sessionConfig.profileType === "chat") {
                const snapshotFrames = await wsGetFrames();
                const { chunks, bytes } = countAudioDeltas(snapshotFrames);
                extractedAudioChunks = chunks;
                extractedAudioBytes = bytes;
            }

            setSessionSummary({
                profileType: sessionConfig.profileType,
                status: "final_received",
                startedFrame,
                finalFrame,
                extractedText,
                extractedAudioChunks,
                extractedAudioBytes,
                error: "",
            });
            setSessionSummary({
                profileType: sessionConfig.profileType,
                status: "completed",
                startedFrame,
                finalFrame,
                extractedText,
                extractedAudioChunks,
                extractedAudioBytes,
                error: "",
            });
            updateStatus(`${sessionConfig.profileType} final received（manual close）`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setSessionSummary((prev) => ({
                ...prev,
                status: "error",
                error: message,
            }));
            try {
                const currentStreamStatus = await wsPCMStreamStatus();
                if (currentStreamStatus.running) {
                    await wsStopPCMStream();
                }
            } catch {
            }
            setStreaming(false);
            updateStatus(message);
        } finally {
            sessionRunnerRef.current = false;
            sessionStatusRef.current = "";
        }
    };

    const handleRunSession = async () => {
        await runSessionFlow({
            profileType: sessionProfile,
            filePath: pcmFilePath,
            sampleRate,
            channels,
            bitDepth,
            frameMs,
            seqStart,
            headerRules,
        });
    };

    const handleRunMiniTranslation = async () => {
        applyMiniTranslationState();
        await runSessionFlow({
            profileType: "translation",
            filePath: pcmFilePath,
            sampleRate: 16000,
            channels: 1,
            bitDepth: 16,
            frameMs: 20,
            seqStart: 1,
            headerRules: cloneMiniTranslationHeaderPreset(),
        });
    };

    const handleStopStream = async () => {
        try {
            const result = await wsStopPCMStream();
            updateStatus(result.message);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            updateStatus(message);
        } finally {
            if (micStreaming) {
                await releaseMicCapture();
            }
            setMicStreaming(false);
            setStreaming(false);
            resetMicVisuals();
        }
    };

    const tryFormatJSON = (raw: string): string | null => {
        const trimmed = raw.trim();
        if (!trimmed) {
            return null;
        }

        if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
            return null;
        }

        try {
            const parsed = JSON.parse(trimmed) as unknown;
            return JSON.stringify(parsed, null, "\t");
        } catch {
            return null;
        }
    };

    const audioProbeMiniClass = !autoPlayServerPCM
                ? "off"
                : audioProbe.scanned === 0
                    ? "idle"
                    : audioProbe.matched === 0
                        ? "bad"
                        : audioProbe.failed > 0
                            ? "warn"
                            : "good";

    const leftColumnPanel = (
        <Group orientation="vertical" style={{ flex: 1, minHeight: 0 }}>
            <Panel
                panelRef={connectionPanelRef}
                defaultSize={25}
                minSize={`${connectionPanelEffectiveMinPercent}%`}
                collapsible={connectionPanelEffectiveCollapsible}
                collapsedSize={`${pxToLeftColPercent(CONNECTION_COLLAPSED_HEIGHT_PX)}%`}
                onResize={handleConnectionPanelResize}
            >
                <ConnectionPanel
                    url={url}
                    headersText={headersText}
                    queryParamsText={queryParamsText}
                    subprotocol={subprotocol}
                    connected={connected}
                    statusText={statusText}
                    savedConnections={savedConnections}
                    isCollapsed={connectionPanelCollapsed}
                    onToggleCollapsed={handleToggleConnectionPanel}
                    onUrlChange={setUrl}
                    onHeadersChange={setHeadersText}
                    onQueryParamsChange={setQueryParamsText}
                    onSubprotocolChange={setSubprotocol}
                    onConnect={handleConnect}
                    onReconnect={handleReconnect}
                    onDisconnect={handleDisconnect}
                    onPing={handlePing}
                    onUseSavedConnection={handleUseSavedConnection}
                    onSaveCurrentConnection={handleSaveCurrentConnection}
                />
            </Panel>
            <Separator
                className="left-column-resize-handle"
                onPointerDown={() => {
                const connectionCollapsedNow = isConnectionPhysicallyCollapsed();
                logLowerSeparatorDebug("connection-separator-pointer-down", {
                    connectionCollapsedNow,
                    panelIsCollapsed: connectionPanelRef.current?.isCollapsed(),
                    panelSize: connectionPanelRef.current?.getSize(),
                });

                if (connectionCollapsedNow) {
                    connectionPanelRef.current?.expand();
                    setConnectionPanelCollapsed(false);
                    logLowerSeparatorDebug("connection-separator-sync-expand-for-drag", {
                        panelIsCollapsed: connectionPanelRef.current?.isCollapsed(),
                        panelSize: connectionPanelRef.current?.getSize(),
                    });
                }

                handleConnectionResizeStart();
                handleSendResizeStart();
            }}
            >
                <div className="resize-handle-bar" />
            </Separator>
            <Panel
                panelRef={sendPanelRef}
                defaultSize={35}
                minSize={`${pxToLeftColPercent(CONNECTION_COLLAPSED_HEIGHT_PX + PANEL_MIN_GAP_PX)}%`}
                collapsible
                collapsedSize={`${pxToLeftColPercent(CONNECTION_COLLAPSED_HEIGHT_PX)}%`}
                onResize={handleSendPanelResize}
            >
                <SendPanel
                    textPayload={textPayload}
                    binaryPayload={binaryPayload}
                    binaryFilePath={binaryFilePath}
                    pcmFilePath={pcmFilePath}
                    sampleRate={sampleRate}
                    channels={channels}
                    bitDepth={bitDepth}
                    frameMs={frameMs}
                    seqStart={seqStart}
                    headerRules={headerRules}
                    headerTemplates={headerTemplates}
                    streaming={streaming}
                    connected={connected}
                    sessionProfile={sessionProfile}
                    streamStatus={streamStatus}
                    micStreaming={micStreaming}
                    micInputLevel={micInputLevel}
                    micWaveform={micWaveform}
                    playbackWaveform={playbackWaveform}
                    audioFileInfo={audioFileInfo}
                    translationFromLanguage={translationFromLanguage}
                    translationToLanguagesText={translationToLanguagesText}
                    audioParamSource={audioParamSource}
                    headerConfigSource={headerConfigSource}
                    onTextChange={setTextPayload}
                    onBinaryChange={setBinaryPayload}
                    onBinaryFilePathChange={setBinaryFilePath}
                    onPcmFilePathChange={(value) => {
                        setPcmFilePath(value);
                        if (audioFileInfo?.path !== value.trim()) {
                            setAudioFileInfo(undefined);
                        }
                    }}
                    onPickBinaryFile={handlePickBinaryFile}
                    onPickPcmFile={handlePickPcmFile}
                    onSampleRateChange={(value) => {
                        setSampleRate(value);
                        setAudioParamSource("Manual");
                    }}
                    onChannelsChange={(value) => {
                        setChannels(value);
                        setAudioParamSource("Manual");
                    }}
                    onBitDepthChange={(value) => {
                        setBitDepth(value);
                        setAudioParamSource("Manual");
                    }}
                    onFrameMsChange={(value) => {
                        setFrameMs(value);
                        setAudioParamSource("Manual");
                    }}
                    onSeqStartChange={(value) => {
                        setSeqStart(value);
                        setHeaderConfigSource("Manual");
                    }}
                    onHeaderRulesChange={(value) => {
                        setHeaderRules(value);
                        setHeaderConfigSource("Manual");
                    }}
                    onSaveHeaderTemplate={handleSaveHeaderTemplate}
                    onLoadHeaderTemplate={handleLoadHeaderTemplate}
                    onRenameHeaderTemplate={handleRenameHeaderTemplate}
                    onDeleteHeaderTemplate={handleDeleteHeaderTemplate}
                    onApplyMiniTranslationPreset={handleApplyMiniTranslationPreset}
                    onRunMiniTranslation={handleRunMiniTranslation}
                    onTranslationFromLanguageChange={(value) => setTranslationFromLanguage(normalizeLanguageTag(value) || value.trim())}
                    onTranslationToLanguagesChange={(value) => setTranslationToLanguagesText(value)}
                    onApplyTranslationLanguagePreset={(fromLanguage, toLanguages) => {
                        const normalizedFromLanguage = normalizeLanguageTag(fromLanguage) || "zh-CN";
                        const normalizedToLanguagesText = toLanguages
                            .map((item) => normalizeLanguageTag(item))
                            .filter(Boolean)
                            .join(", ");
                        setTranslationFromLanguage(normalizedFromLanguage);
                        setTranslationToLanguagesText(normalizedToLanguagesText);
                        if (sessionProfile === "translation") {
                            setTextPayload(buildTranslationStartTemplate(normalizedFromLanguage, normalizedToLanguagesText));
                        }
                    }}
                    onSessionProfileChange={setSessionProfile}
                    onApplyJSONTemplate={handleApplyJSONTemplate}
                    onSendText={handleSendText}
                    onSendBinary={handleSendBinary}
                    onSendBinaryFile={handleSendBinaryFile}
                    onRunSession={handleRunSession}
                    onStartStream={handleStartStream}
                    onStopStream={handleStopStream}
                    onStartMicStream={handleStartMicStream}
                    onStopMicStream={handleStopMicStream}
                    onScrollCollapse={(collapsed) => {
                        if (collapsed) {
                            collapseConnectionPanel();
                            return;
                        }
                        expandConnectionPanel();
                    }}
                    scrollExpandPreset={scrollExpandPreset}
                    collapsed={sendPanelCollapsed}
                    onToggleCollapsed={handleToggleSendPanel}
                />
            </Panel>
            <Separator
                className="left-column-resize-handle"
                onPointerDown={() => {
                    handleSendResizeStart();
                    handleResponseResizeStart();
                }}
            >
                <div className="resize-handle-bar" />
            </Separator>
            <Panel
                panelRef={responsePanelRef}
                defaultSize={40}
                minSize={`${pxToLeftColPercent(CONNECTION_COLLAPSED_HEIGHT_PX + PANEL_MIN_GAP_PX)}%`}
                collapsible
                collapsedSize={`${pxToLeftColPercent(CONNECTION_COLLAPSED_HEIGHT_PX)}%`}
                onResize={handleResponsePanelResize}
            >
                <ResponsePanel
                    frame={latestInboundFrame}
                    sessionSummary={sessionSummary}
                    liveText={liveAssistantText}
                    playbackWaveform={playbackWaveform}
                    playbackPositionSec={playbackPositionSec}
                    playbackTotalDurationSec={playbackTotalDurationSec}
                    collapsed={responsePanelCollapsed}
                    dragActive={lowerSeparatorDragInProgress}
                    onToggleCollapsed={handleToggleResponsePanel}
                />
            </Panel>
        </Group>
    );

    const rightColumnPanel = (
        <Group orientation="vertical" style={{ flex: 1, minHeight: 0 }}>
            <Panel
                panelRef={frameListPanelRef}
                defaultSize={50}
                minSize={`${pxToRightColPercent(FRAME_PANEL_COLLAPSED_HEIGHT_PX + PANEL_MIN_GAP_PX)}%`}
                collapsible
                collapsedSize={`${pxToRightColPercent(FRAME_PANEL_COLLAPSED_HEIGHT_PX)}%`}
                onResize={handleFrameListPanelResize}
            >
                <FrameList
                    frames={frames}
                    selectedId={selectedId}
                    collapsed={frameListCollapsed}
                    searchText={searchText}
                    directionFilter={directionFilter}
                    typeFilter={typeFilter}
                    onToggleCollapsed={handleToggleFrameListPanel}
                    onClear={handleClear}
                    onSearchTextChange={setSearchText}
                    onDirectionFilterChange={setDirectionFilter}
                    onTypeFilterChange={setTypeFilter}
                    onSelect={(id) => {
                        setSelectedId(id);
                        if (frameDetailCollapsed) {
                            expandFrameDetailPanel();
                        }
                    }}
                />
            </Panel>
            <Separator className="right-column-resize-handle" onPointerDown={handleRightColumnResizeStart}>
                <div className="resize-handle-bar" />
            </Separator>
            <Panel
                panelRef={frameDetailPanelRef}
                defaultSize={50}
                minSize={`${pxToRightColPercent(FRAME_PANEL_COLLAPSED_HEIGHT_PX + PANEL_MIN_GAP_PX)}%`}
                collapsible
                collapsedSize={`${pxToRightColPercent(FRAME_PANEL_COLLAPSED_HEIGHT_PX)}%`}
                onResize={handleFrameDetailPanelResize}
            >
                <FrameDetail
                    frame={selectedFrame}
                    collapsed={frameDetailCollapsed}
                    onToggleCollapsed={handleToggleFrameDetailPanel}
                />
            </Panel>
        </Group>
    );

    return (
        <div id="app" className="layout">
            <header className="app-header">
                <div className="app-title">WaveCat - AI Voice WebSocket Debugger (MVP)</div>
                <div className="header-settings" ref={settingsRef}>
                    <button
                        type="button"
                        className={`speaker-indicator speaker-toggle-button ${!autoPlayServerPCM ? "off" : serverPCMPlaying ? "playing" : "idle"}`}
                        onClick={() => {
                            void handleToggleAutoPlayServerPCM(!autoPlayServerPCM);
                        }}
                        title={autoPlayServerPCM ? "Click to mute realtime playback" : "Click to enable realtime playback"}
                        aria-label={autoPlayServerPCM ? "Mute realtime playback" : "Enable realtime playback"}
                    >
                        <span className="speaker-dot" />
                        <span>
                            🔊 {autoPlayServerPCM ? (serverPCMPlaying ? "playing" : "idle") : "off"}
                            {autoPlayServerPCM ? ` · ${serverPCMPlayedChunks} chunks` : ""}
                        </span>
                    </button>
                    <button
                        type="button"
                        className={`audio-probe-mini ${audioProbeMiniClass}`}
                        title={`Audio probe · scanned=${audioProbe.scanned}, matched=${audioProbe.matched}, failed=${audioProbe.failed}, skipped=${audioProbe.skipped}, queue=${audioProbe.queueLength}, scheduled=${audioProbe.scheduledSources}, op=${audioProbe.lastOperationId || "-"}, durationMs=${audioProbe.lastDurationMs.toFixed(1)}, rms=${audioProbe.lastRms.toFixed(4)}, peak=${audioProbe.lastPeak.toFixed(4)}, jump=${audioProbe.lastBoundaryJump.toFixed(4)}, smoothingMs=${audioProbe.lastSmoothingMs.toFixed(1)}, reason=${audioProbe.lastReason || "-"}`}
                        onClick={() => setProbeDetailsOpen((prev) => !prev)}
                    >
                        probe {audioProbe.matched}/{audioProbe.scanned}
                        {audioProbe.queueLength > 0 || audioProbe.scheduledSources > 0 ? ` · q ${audioProbe.queueLength}/${audioProbe.scheduledSources}` : ""}
                        {audioProbe.skipped > 0 ? ` · skip ${audioProbe.skipped}` : ""}
                        {audioProbe.failed > 0 ? ` · fail ${audioProbe.failed}` : ""}
                    </button>
                    <button
                        type="button"
                        className="audio-probe-mini bad"
                        onClick={handleAbortPlayback}
                        disabled={!autoPlayServerPCM || (audioProbe.queueLength === 0 && audioProbe.scheduledSources === 0)}
                        title="Abort current audio playback"
                        aria-label="Abort current audio playback"
                    >
                        ⏹ stop audio
                    </button>
                    {probeDetailsOpen ? (
                        <div className="probe-popover">
                            <div className="audio-probe-title">Audio Probe</div>
                            <div className="audio-probe-row">scanned: {audioProbe.scanned}</div>
                            <div className="audio-probe-row">matched: {audioProbe.matched}</div>
                            <div className="audio-probe-row">skipped: {audioProbe.skipped}</div>
                            <div className="audio-probe-row">decode/play failed: {audioProbe.failed}</div>
                            <div className="audio-probe-row">queue length: {audioProbe.queueLength}</div>
                            <div className="audio-probe-row">scheduled sources: {audioProbe.scheduledSources}</div>
                            <div className="audio-probe-row">last operation_id: {audioProbe.lastOperationId || "-"}</div>
                            <div className="audio-probe-row">last chunk bytes: {audioProbe.lastBytes}</div>
                            <div className="audio-probe-row">last chunk duration: {audioProbe.lastDurationMs.toFixed(1)} ms</div>
                            <div className="audio-probe-row">last chunk rms: {audioProbe.lastRms.toFixed(4)}</div>
                            <div className="audio-probe-row">last chunk peak: {audioProbe.lastPeak.toFixed(4)}</div>
                            <div className="audio-probe-row">last boundary jump: {audioProbe.lastBoundaryJump.toFixed(4)}</div>
                            <div className="audio-probe-row">last smoothing ms: {audioProbe.lastSmoothingMs.toFixed(1)}</div>
                            <div className="audio-probe-row">last reason: {audioProbe.lastReason || "-"}</div>
                            <div className="chunk-log-record-row">
                                {!pcmRecording ? (
                                    <button
                                        type="button"
                                        className="chunk-log-clear"
                                        onClick={() => {
                                            pcmRecordingRef.current = [];
                                            setPcmRecording(true);
                                        }}
                                    >&#9210; Record PCM</button>
                                ) : (
                                    <button
                                        type="button"
                                        className="chunk-log-clear chunk-log-stop"
                                        onClick={() => {
                                            const chunks = pcmRecordingRef.current ?? [];
                                            pcmRecordingRef.current = null;
                                            setPcmRecording(false);
                                            if (chunks.length === 0) {
                                                alert("未录制到任何 PCM 数据，请先点 Record 再发起对话。");
                                                return;
                                            }
                                            const totalLen = chunks.reduce((s, c) => s + c.length, 0);
                                            const merged = new Uint8Array(totalLen);
                                            let offset = 0;
                                            for (const c of chunks) { merged.set(c, offset); offset += c.length; }
                                            let binary = "";
                                            for (let i = 0; i < merged.length; i++) { binary += String.fromCharCode(merged[i]); }
                                            const b64 = btoa(binary);
                                            void wsSavePCMBytes(b64)
                                                .then((res) => {
                                                    if (!res.success) {
                                                        if (res.message === "已取消") {
                                                            alert("已取消保存");
                                                            return;
                                                        }
                                                        alert("保存失败: " + (res.message || "未知错误"));
                                                        return;
                                                    }
                                                    alert("已保存: " + (res.message || "PCM 文件"));
                                                })
                                                .catch((err) => {
                                                    const message = err instanceof Error ? err.message : String(err);
                                                    alert("调用保存接口失败，请重启 wails dev 后重试。\n" + message);
                                                });
                                        }}
                                    >&#9209; Stop &amp; Save</button>
                                )}
                                {pcmRecording ? <span className="chunk-log-recording-dot">&#9679; REC</span> : null}
                            </div>
                                                        {chunkLog.length > 0 ? (
                                <div className="chunk-log-section">
                                    <div className="chunk-log-header">
                                        <span>Chunk Playback Log ({chunkLog.length})</span>
                                        <button
                                            type="button"
                                            className="chunk-log-clear"
                                            onClick={() => {
                                                setChunkLog([]);
                                                logSessionStartRef.current = null;
                                            }}
                                        >clear</button>
                                    </div>
                                    <div className="chunk-log-table-wrap">
                                        <table className="chunk-log-table">
                                            <thead>
                                                <tr>
                                                    <th>+ms</th>
                                                    <th>rms</th>
                                                    <th>peak</th>
                                                    <th>jump</th>
                                                    <th>dur</th>
                                                    <th>B</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {chunkLog.map((row, i) => (
                                                    <tr key={i} className={row.jump > 0.15 ? "chunk-log-row-warn" : row.jump > 0.05 ? "chunk-log-row-mild" : ""}>
                                                        <td>+{row.t}</td>
                                                        <td>{row.rms.toFixed(3)}</td>
                                                        <td>{row.peak.toFixed(3)}</td>
                                                        <td>{row.jump.toFixed(3)}</td>
                                                        <td>{row.dur.toFixed(0)}</td>
                                                        <td>{row.bytes}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    <button
                        type="button"
                        className="settings-button"
                        aria-label="Open Settings"
                        onClick={() => {
                            setProbeDetailsOpen(false);
                            setSettingsOpen((prev) => !prev);
                        }}
                    >
                        ⚙
                    </button>
                    {settingsOpen ? (
                        <div className="settings-popover">
                            <label className="field">
                                <span>Up Scroll Expand Feel</span>
                                <select
                                    value={scrollExpandPreset}
                                    onChange={(event) => setScrollExpandPreset(event.target.value as "sensitive" | "stable")}
                                >
                                    <option value="sensitive">Sensitive (faster expand)</option>
                                    <option value="stable">Stable (fewer accidental expands)</option>
                                </select>
                            </label>
                            <label className="field">
                                <span className="settings-checkbox-row">
                                    <input
                                        type="checkbox"
                                        checked={autoPlayServerPCM}
                                        onChange={(event) => {
                                            void handleToggleAutoPlayServerPCM(event.target.checked);
                                        }}
                                    />
                                    Real-time play server Base64 PCM chunks
                                </span>
                            </label>
                            <label className="field">
                                <span>Server PCM Sample Rate</span>
                                <select
                                    value={String(serverPCMSampleRate)}
                                    onChange={(event) => setServerPCMSampleRate(Number(event.target.value) || 16000)}
                                >
                                    <option value="16000">16000 Hz</option>
                                    <option value="24000">24000 Hz</option>
                                    <option value="32000">32000 Hz</option>
                                    <option value="48000">48000 Hz</option>
                                </select>
                            </label>
                            <label className="field">
                                <span>Server PCM Channels</span>
                                <select
                                    value={String(serverPCMChannels)}
                                    onChange={(event) => setServerPCMChannels(Number(event.target.value) === 2 ? 2 : 1)}
                                >
                                    <option value="1">Mono (1)</option>
                                    <option value="2">Stereo (2)</option>
                                </select>
                            </label>
                            <label className="field">
                                <span>Playback Mode</span>
                                <select
                                    value={String(serverPCMMaxScheduledSources)}
                                    onChange={(event) => {
                                        const next = Number(event.target.value);
                                        setServerPCMMaxScheduledSources(Number.isFinite(next) ? Math.max(1, Math.min(10, Math.floor(next))) : 10);
                                    }}
                                >
                                    <option value="1">Strict Serial (1)</option>
                                    <option value="2">1-ahead (2)</option>
                                    <option value="3">2-ahead (3)</option>
                                    <option value="4">3-ahead (4)</option>
                                    <option value="5">4-ahead (5)</option>
                                    <option value="6">5-ahead (6)</option>
                                    <option value="7">6-ahead (7)</option>
                                    <option value="8">7-ahead (8)</option>
                                    <option value="9">8-ahead (9)</option>
                                    <option value="10">9-ahead (10, recommended)</option>
                                </select>
                            </label>
                            <label className="field">
                                <span>Start Buffer Threshold</span>
                                <select
                                    value={String(serverPCMMinStartBufferMs)}
                                    onChange={(event) => {
                                        const next = Number(event.target.value);
                                        setServerPCMMinStartBufferMs(Number.isFinite(next) ? Math.max(40, Math.min(400, Math.floor(next))) : 120);
                                    }}
                                >
                                    <option value="80">80 ms (low latency)</option>
                                    <option value="120">120 ms (balanced)</option>
                                    <option value="180">180 ms (stable)</option>
                                    <option value="240">240 ms (very stable)</option>
                                    <option value="400">400 ms (max delay, most stable)</option>
                                </select>
                            </label>
                            <label className="field">
                                <span>Chunk Crossfade: {serverPCMCrossfadeMs.toFixed(1)} ms</span>
                                <input
                                    type="range"
                                    min={0}
                                    max={12}
                                    step={0.5}
                                    value={serverPCMCrossfadeMs}
                                    onChange={(event) => {
                                        const next = Number(event.target.value);
                                        setServerPCMCrossfadeMs(Number.isFinite(next) ? Math.max(0, Math.min(12, next)) : 4);
                                    }}
                                />
                            </label>
                            <label className="field">
                                <span className="checkbox-row">
                                    <input
                                        type="checkbox"
                                        checked={serverPCMAdaptiveRateEnabled}
                                        onChange={(event) => setServerPCMAdaptiveRateEnabled(event.target.checked)}
                                    />
                                    Adaptive Playback Rate
                                </span>
                            </label>
                            <label className="field">
                                <span>Adaptive Rate Strength: {serverPCMAdaptiveRateStrength.toFixed(2)}x</span>
                                <input
                                    type="range"
                                    min={0}
                                    max={2}
                                    step={0.1}
                                    value={serverPCMAdaptiveRateStrength}
                                    disabled={!serverPCMAdaptiveRateEnabled}
                                    onChange={(event) => {
                                        const next = Number(event.target.value);
                                        setServerPCMAdaptiveRateStrength(Number.isFinite(next) ? Math.max(0, Math.min(2, next)) : 1);
                                    }}
                                />
                            </label>
                            <label className="field">
                                <span>
                                    Drag Collapse Adjustable Threshold: {lowerSeparatorPointerSpeedAdjustableThreshold.toFixed(2)} px/ms
                                </span>
                                <input
                                    type="range"
                                    min={0.2}
                                    max={4}
                                    step={0.1}
                                    value={lowerSeparatorPointerSpeedAdjustableThreshold}
                                    onChange={(event) => {
                                        const next = Number(event.target.value);
                                        setLowerSeparatorPointerSpeedAdjustableThreshold(
                                            Number.isFinite(next)
                                                ? Math.max(0.2, Math.min(4, next))
                                                : DEFAULT_LOWER_SEPARATOR_POINTER_SPEED_ADJUSTABLE_THRESHOLD_PX_PER_MS
                                        );
                                    }}
                                />
                            </label>
                            <label className="field">
                                <span>
                                    Drag Collapse Min Trigger Speed: {lowerSeparatorPointerMinTriggerSpeed.toFixed(2)} px/ms
                                </span>
                                <input
                                    type="range"
                                    min={0.1}
                                    max={2.5}
                                    step={0.1}
                                    value={lowerSeparatorPointerMinTriggerSpeed}
                                    onChange={(event) => {
                                        const next = Number(event.target.value);
                                        setLowerSeparatorPointerMinTriggerSpeed(
                                            Number.isFinite(next)
                                                ? Math.max(0.1, Math.min(2.5, next))
                                                : DEFAULT_LOWER_SEPARATOR_POINTER_MIN_TRIGGER_SPEED_PX_PER_MS
                                        );
                                    }}
                                />
                            </label>
                            <div className="field">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setLowerSeparatorPointerSpeedAdjustableThreshold(
                                            DEFAULT_LOWER_SEPARATOR_POINTER_SPEED_ADJUSTABLE_THRESHOLD_PX_PER_MS
                                        );
                                        setLowerSeparatorPointerMinTriggerSpeed(
                                            DEFAULT_LOWER_SEPARATOR_POINTER_MIN_TRIGGER_SPEED_PX_PER_MS
                                        );
                                    }}
                                >
                                    Reset Drag Threshold Defaults
                                </button>
                            </div>
                            <div className="audio-probe-row">
                                active trigger speed: {lowerSeparatorPointerTriggerSpeed.toFixed(2)} px/ms (max of adjustable and min)
                            </div>
                            <div className="audio-probe-block">
                                <div className="audio-probe-title">Audio Probe</div>
                                <div className="audio-probe-row">scanned: {audioProbe.scanned}</div>
                                <div className="audio-probe-row">matched: {audioProbe.matched}</div>
                                <div className="audio-probe-row">skipped: {audioProbe.skipped}</div>
                                <div className="audio-probe-row">decode/play failed: {audioProbe.failed}</div>
                                <div className="audio-probe-row">queue length: {audioProbe.queueLength}</div>
                                <div className="audio-probe-row">scheduled sources: {audioProbe.scheduledSources}</div>
                                <div className="audio-probe-row">last operation_id: {audioProbe.lastOperationId || "-"}</div>
                                <div className="audio-probe-row">last chunk bytes: {audioProbe.lastBytes}</div>
                                <div className="audio-probe-row">last chunk duration: {audioProbe.lastDurationMs.toFixed(1)} ms</div>
                                <div className="audio-probe-row">last chunk rms: {audioProbe.lastRms.toFixed(4)}</div>
                                <div className="audio-probe-row">last chunk peak: {audioProbe.lastPeak.toFixed(4)}</div>
                                <div className="audio-probe-row">last boundary jump: {audioProbe.lastBoundaryJump.toFixed(4)}</div>
                                <div className="audio-probe-row">last smoothing ms: {audioProbe.lastSmoothingMs.toFixed(1)}</div>
                                <div className="audio-probe-row">last reason: {audioProbe.lastReason || "-"}</div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </header>
            {compactMainLayout ? (
                <div className="workspace-grid">
                    {leftColumnPanel}
                    {rightColumnPanel}
                </div>
            ) : (
                <div className="workspace-split-root">
                    <Group orientation="horizontal" style={{ flex: 1, minHeight: 0 }}>
                        <Panel defaultSize={56} minSize={35}>
                            {leftColumnPanel}
                        </Panel>
                        <Separator className="workspace-resize-handle">
                            <div className="workspace-resize-bar" />
                        </Separator>
                        <Panel defaultSize={44} minSize={30}>
                            {rightColumnPanel}
                        </Panel>
                    </Group>
                </div>
            )}
        </div>
    );
}

export default App;


