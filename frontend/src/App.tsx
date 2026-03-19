import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { FrameDetail } from "./components/FrameDetail";
import { FrameList } from "./components/FrameList";
import { ResponsePanel } from "./components/ResponsePanel";
import { SendPanel } from "./components/SendPanel";
import {
    wsClearFrames,
    wsConnect,
    wsDisconnect,
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
} from "./services/api";
import type { AudioStreamStatus, Frame, SessionProfileType, SessionSummary } from "./types";

function App() {
    const [url, setUrl] = useState("ws://127.0.0.1:8080/ws");
    const [headersText, setHeadersText] = useState("{}");
    const [queryParamsText, setQueryParamsText] = useState("{}");
    const [subprotocol, setSubprotocol] = useState("");
    const [statusText, setStatusText] = useState("disconnected");
    const [connected, setConnected] = useState(false);
    const [frames, setFrames] = useState<Frame[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [searchText, setSearchText] = useState("");
    const [directionFilter, setDirectionFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState("all");
    const [textPayload, setTextPayload] = useState('{"type":"hello"}');
    const [binaryPayload, setBinaryPayload] = useState("aGVsbG8=");
    const [binaryFilePath, setBinaryFilePath] = useState("");
    const [pcmFilePath, setPcmFilePath] = useState("");
    const [sampleRate, setSampleRate] = useState(16000);
    const [channels, setChannels] = useState(1);
    const [bitDepth, setBitDepth] = useState(16);
    const [frameMs, setFrameMs] = useState(20);
    const [seqStart, setSeqStart] = useState(0);
    const [jsonVariableContext, setJSONVariableContext] = useState({
        conversationId: "",
        streamId: 21,
    });
    const [headerRules, setHeaderRules] = useState([
        { name: "seq", type: "uint16", length: 2, endian: "big", defaultValue: "0", rule: "seq" },
        { name: "payload_len", type: "uint16", length: 2, endian: "big", defaultValue: "0", rule: "payload_len" },
    ]);
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

    const updateStatus = (message: string) => {
        lastStatusRef.current = message;
        setStatusText(message);
    };

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

                setConnected((prev) => {
                    const next = nextStatus.state === "connected";
                    return prev === next ? prev : next;
                });
                if (nextStatus.state !== "connected") {
                    setStreaming(false);
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
                    if (last?.id) {
                        setSelectedId(last.id);
                    }

                    if (pendingResponseRef.current) {
                        const latestIncoming = [...nextFrames]
                            .reverse()
                            .find((frame) => frame.direction === "in" && frame.id > pendingAfterIdRef.current);
                        if (latestIncoming) {
                            clearPendingResponse();
                            updateStatus("response received");
                            setSelectedId(latestIncoming.id);
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
        };
    }, []);

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
        if (last?.id) {
            setSelectedId(last.id);
        }
        const frameSig = `${nextFrames.length}:${last?.id ?? 0}:${last?.timestamp ?? 0}`;
        lastFrameSigRef.current = frameSig;
        return { nextFrames, last };
    };

    const handleConnect = async () => {
        try {
            const result = await wsConnect({
                url,
                headers: parseHeaders(),
                queryParams: parseQueryParams(),
                subprotocol: subprotocol.trim(),
            });
            updateStatus(result.message);
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
        clearPendingResponse();
        updateStatus(result.message);
        setStreaming(false);
    };

    const handlePing = async () => {
        const result = await wsPing();
        updateStatus(result.message);
    };

    const handleClear = async () => {
        await wsClearFrames();
        setSelectedId(null);
    };

    const applyJSONVariables = (raw: string) => {
        const now = Date.now();
        const conversationId = jsonVariableContext.conversationId || `conv-${now}`;
        const streamId = jsonVariableContext.streamId || 21;
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
            setTextPayload(`{\n  "message_id": "${"${message_id}"}",\n  "operation_id": "${"${operation_id}"}",\n  "conversation_id": "${"${conversation_id}"}",\n  "stream_id": ${"${stream_id}"},\n  "type": "translation",\n  "event": "start",\n  "payload": {\n    "from_language": "zh-CN",\n    "to_languages": ["en"]\n  },\n  "created_at": ${"${created_at}"}\n}`);
            return;
        }
        if (template === "translation_close") {
            setTextPayload(`{\n  "message_id": "${"${message_id}"}",\n  "operation_id": "${"${operation_id}"}",\n  "conversation_id": "${"${conversation_id}"}",\n  "stream_id": ${"${stream_id}"},\n  "type": "translation",\n  "event": "close_session",\n  "payload": {},\n  "created_at": ${"${created_at}"}\n}`);
            return;
        }
        if (template === "chat_start") {
            setTextPayload(`{\n  "message_id": "${"${message_id}"}",\n  "conversation_id": "${"${conversation_id}"}",\n  "stream_id": ${"${stream_id}"},\n  "type": "chat",\n  "event": "start",\n  "payload": {\n    "instructions": "你是简洁可靠的中文语音助手，优先直接回答用户问题。"\n  },\n  "created_at": ${"${created_at}"}\n}`);
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
            const result = await wsStartPCMStream({
                filePath: pcmFilePath.trim(),
                sampleRate,
                channels,
                bitDepth,
                frameMs,
                seqStart,
                headerRules,
            });
            updateStatus(result.message);
            setStreaming(result.success);
            setStreamStatus({
                running: result.success,
                filePath: pcmFilePath.trim(),
                frameBytes: 0,
                frameMs,
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
                updateStatus("pcm file selected");
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

    const handleLoadHeaderTemplate = (index: number) => {
        const template = headerTemplates[index];
        if (!template) {
            return;
        }
        setSeqStart(template.seqStart ?? 0);
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
        afterId = 0
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
            if (last?.id) {
                setSelectedId(last.id);
            }
            if (matched) {
                setSelectedId(matched.id);
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
                payload?: { event?: unknown; status?: unknown; source_type?: unknown };
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
                payload?: { source_type?: unknown; delta?: unknown };
            };
            return (
                parsed.type === "chat" &&
                parsed.event === "interim" &&
                parsed.payload?.source_type === "response.audio.delta" &&
                typeof parsed.payload?.delta === "string" &&
                parsed.payload.delta.length > 0
            );
        } catch {
            return false;
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
    "instructions": "你是简洁可靠的中文语音助手，优先直接回答用户问题。"
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
            return `{
  "message_id": "${"${message_id}"}",
  "operation_id": "${"${operation_id}"}",
  "conversation_id": "${"${conversation_id}"}",
  "stream_id": ${"${stream_id}"},
  "type": "translation",
  "event": "start",
  "payload": {
    "from_language": "zh-CN",
    "to_languages": ["en"]
  },
  "created_at": ${"${created_at}"}
}`;
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

    const handleRunSession = async () => {
        if (sessionRunnerRef.current) {
            return;
        }
        sessionRunnerRef.current = true;
        sessionStatusRef.current = "";
        setSessionSummary({
            profileType: sessionProfile,
            status: "starting",
            extractedText: "",
            extractedAudioChunks: 0,
            extractedAudioBytes: 0,
            error: "",
        });
        try {
            if (!connected) {
                await handleConnect();
            }

            const startSnapshot = await wsGetFrames();
            const startAfterId = startSnapshot[startSnapshot.length - 1]?.id ?? 0;

            const startTemplate = buildSessionTemplate(sessionProfile, "start");
            const injectedStartPayload = applyJSONVariables(startTemplate);
            const startPayload = tryFormatJSON(injectedStartPayload) ?? injectedStartPayload;
            setTextPayload(startPayload);
            const startResult = await wsSendText(startPayload);
            if (!startResult.success) {
                throw new Error(startResult.message);
            }

            updateStatus(`waiting ${sessionProfile}/started...`);
            setSessionSummary({
                profileType: sessionProfile,
                status: "waiting_started",
                extractedText: "",
                extractedAudioChunks: 0,
                extractedAudioBytes: 0,
                error: "",
            });
            const startedFrame = await waitForInboundEvent(
                (text) => matchesSessionEvent(text, sessionProfile, ["started"]),
                15000,
                startAfterId
            );

            const streamStartResult = await wsStartPCMStream({
                filePath: pcmFilePath.trim(),
                sampleRate,
                channels,
                bitDepth,
                frameMs,
                seqStart,
                headerRules,
            });
            if (!streamStartResult.success) {
                throw new Error(streamStartResult.message);
            }
            setStreaming(true);
            setSessionSummary({
                profileType: sessionProfile,
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

            updateStatus(`waiting ${sessionProfile} final/completed...`);
            let extractedAudioChunks = 0;
            let extractedAudioBytes = 0;
            setSessionSummary({
                profileType: sessionProfile,
                status: "waiting_final",
                startedFrame,
                extractedText: "",
                extractedAudioChunks: 0,
                extractedAudioBytes: 0,
                error: "",
            });
            const finalFrame = await waitForInboundEvent(
                (text) => {
                    if (sessionProfile === "translation") {
                        return isTranslationFinalFrame(text);
                    }
                    return matchesSessionEvent(text, sessionProfile, ["result", "completed", "final", "finished"]);
                },
                30000,
                startedFrame.id
            );
            const extractedText = finalFrame.text ? extractTranslationText(finalFrame.text) : "";

            if (sessionProfile === "chat") {
                const snapshotFrames = await wsGetFrames();
                const inboundFrames = snapshotFrames.filter(
                    (frame) => frame.direction === "in" && frame.id >= startedFrame.id && typeof frame.text === "string"
                );
                const audioDeltaFrames = inboundFrames.filter((frame) => isChatAudioDeltaFrame(frame.text ?? ""));
                extractedAudioChunks = audioDeltaFrames.length;
                extractedAudioBytes = audioDeltaFrames.reduce((sum, frame) => {
                    try {
                        const parsed = JSON.parse(frame.text ?? "") as { payload?: { delta?: unknown } };
                        return sum + (typeof parsed.payload?.delta === "string" ? estimateBase64DecodedBytes(parsed.payload.delta) : 0);
                    } catch {
                        return sum;
                    }
                }, 0);
            }

            setSessionSummary({
                profileType: sessionProfile,
                status: "final_received",
                startedFrame,
                finalFrame,
                extractedText,
                extractedAudioChunks,
                extractedAudioBytes,
                error: "",
            });

            const closeSnapshot = await wsGetFrames();
            const closeAfterId = closeSnapshot[closeSnapshot.length - 1]?.id ?? 0;
            const closeTemplate = buildSessionTemplate(sessionProfile, "close");
            const injectedClosePayload = applyJSONVariables(closeTemplate);
            const closePayload = tryFormatJSON(injectedClosePayload) ?? injectedClosePayload;
            const closeResult = await wsSendText(closePayload);
            if (!closeResult.success) {
                throw new Error(closeResult.message);
            }

            updateStatus(`waiting ${sessionProfile}/session_finished...`);
            setSessionSummary({
                profileType: sessionProfile,
                status: "closing",
                startedFrame,
                finalFrame,
                extractedText,
                extractedAudioChunks,
                extractedAudioBytes,
                error: "",
            });
            const sessionFinishedFrame = await waitForInboundEvent(
                (text) => matchesSessionEvent(text, sessionProfile, ["session_finished", "closed", "close_session_ack"]),
                15000,
                closeAfterId
            );

            setSessionSummary({
                profileType: sessionProfile,
                status: "completed",
                startedFrame,
                finalFrame,
                sessionFinishedFrame,
                extractedText,
                extractedAudioChunks,
                extractedAudioBytes,
                error: "",
            });
            updateStatus(`${sessionProfile} session completed`);
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
                // ignore cleanup errors
            }
            setStreaming(false);
            updateStatus(message);
        } finally {
            sessionRunnerRef.current = false;
            sessionStatusRef.current = "";
        }
    };

    const handleStopStream = async () => {
        try {
            const result = await wsStopPCMStream();
            updateStatus(result.message);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            updateStatus(message);
        } finally {
            setStreaming(false);
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
            return JSON.stringify(parsed, null, 2);
        } catch {
            return null;
        }
    };

    return (
        <div id="app" className="layout">
            <header className="app-header">WaveCat - AI Voice WebSocket Debugger (MVP)</header>
            <ConnectionPanel
                url={url}
                headersText={headersText}
                queryParamsText={queryParamsText}
                subprotocol={subprotocol}
                connected={connected}
                statusText={statusText}
                savedConnections={savedConnections}
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
            <div className="main-grid">
                <FrameList
                    frames={frames}
                    selectedId={selectedId}
                    searchText={searchText}
                    directionFilter={directionFilter}
                    typeFilter={typeFilter}
                    onSelect={setSelectedId}
                    onClear={handleClear}
                    onSearchTextChange={setSearchText}
                    onDirectionFilterChange={setDirectionFilter}
                    onTypeFilterChange={setTypeFilter}
                />
                <FrameDetail frame={selectedFrame} />
            </div>
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
                onTextChange={setTextPayload}
                onBinaryChange={setBinaryPayload}
                onBinaryFilePathChange={setBinaryFilePath}
                onPcmFilePathChange={setPcmFilePath}
                onPickBinaryFile={handlePickBinaryFile}
                onPickPcmFile={handlePickPcmFile}
                onSampleRateChange={setSampleRate}
                onChannelsChange={setChannels}
                onBitDepthChange={setBitDepth}
                onFrameMsChange={setFrameMs}
                onSeqStartChange={setSeqStart}
                onHeaderRulesChange={setHeaderRules}
                onSaveHeaderTemplate={handleSaveHeaderTemplate}
                onLoadHeaderTemplate={handleLoadHeaderTemplate}
                onRenameHeaderTemplate={handleRenameHeaderTemplate}
                onDeleteHeaderTemplate={handleDeleteHeaderTemplate}
                onSessionProfileChange={setSessionProfile}
                onApplyJSONTemplate={handleApplyJSONTemplate}
                onSendText={handleSendText}
                onSendBinary={handleSendBinary}
                onSendBinaryFile={handleSendBinaryFile}
                onRunSession={handleRunSession}
                onStartStream={handleStartStream}
                onStopStream={handleStopStream}
            />
            <ResponsePanel frame={latestInboundFrame} sessionSummary={sessionSummary} />
        </div>
    );
}

export default App;


