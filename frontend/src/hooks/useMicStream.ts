import { useCallback, useRef, useState } from "react";
import { wsSendMicChunkBase64, wsStartMicStream, wsStopMicStream } from "../services/api";
import type { AudioHeaderFieldRule } from "../types";

type UpdateStatusOptions = { pin?: boolean; force?: boolean };

type UseMicStreamParams = {
  connected: boolean;
  streaming: boolean;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  frameMs: number;
  seqStart: number;
  headerRules: AudioHeaderFieldRule[];
  setStreaming: (value: boolean) => void;
  updateStatus: (message: string, options?: UpdateStatusOptions) => void;
};

type UseMicStreamResult = {
  micStreaming: boolean;
  micInputLevel: number;
  micWaveform: number[];
  setMicStreaming: (value: boolean) => void;
  resetMicVisuals: () => void;
  releaseMicCapture: () => Promise<void>;
  handleStartMicStream: () => Promise<void>;
  handleStopMicStream: () => Promise<void>;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function useMicStream(params: UseMicStreamParams): UseMicStreamResult {
  const {
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
  } = params;

  const [micStreaming, setMicStreaming] = useState(false);
  const [micInputLevel, setMicInputLevel] = useState(0);
  const [micWaveform, setMicWaveform] = useState<number[]>([]);

  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micProcessorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const micMonitorGainRef = useRef<GainNode | null>(null);
  const micPendingBytesRef = useRef<Uint8Array>(new Uint8Array(0));
  const micSendQueueRef = useRef(Promise.resolve());
  const micCapturingRef = useRef(false);

  const resetMicVisuals = useCallback(() => {
    setMicInputLevel(0);
    setMicWaveform([]);
  }, []);

  const releaseMicCapture = useCallback(async () => {
    if (micProcessorNodeRef.current) {
      micProcessorNodeRef.current.onaudioprocess = null;
      micProcessorNodeRef.current.disconnect();
      micProcessorNodeRef.current = null;
    }
    if (micMonitorGainRef.current) {
      micMonitorGainRef.current.disconnect();
      micMonitorGainRef.current = null;
    }
    if (micSourceNodeRef.current) {
      micSourceNodeRef.current.disconnect();
      micSourceNodeRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (micAudioContextRef.current) {
      try {
        await micAudioContextRef.current.close();
      } catch {
        // ignore close errors
      }
      micAudioContextRef.current = null;
    }

    micPendingBytesRef.current = new Uint8Array(0);
    micCapturingRef.current = false;
    resetMicVisuals();
    setMicStreaming(false);
  }, [resetMicVisuals]);

  const enqueueMicChunk = useCallback(
    (bytes: Uint8Array) => {
      if (bytes.length === 0) {
        return;
      }
      const encoded = bytesToBase64(bytes);
      micSendQueueRef.current = micSendQueueRef.current
        .then(async () => {
          const result = await wsSendMicChunkBase64(encoded);
          if (!result.success) {
            throw new Error(result.message || "send mic chunk failed");
          }
        })
        .catch(async (error) => {
          const message = error instanceof Error ? error.message : String(error);
          updateStatus(`mic send error: ${message}`);
          await releaseMicCapture();
          await wsStopMicStream();
        });
    },
    [releaseMicCapture, updateStatus]
  );

  const flushMicPendingBytes = useCallback(() => {
    const pending = micPendingBytesRef.current;
    if (pending.length > 0) {
      enqueueMicChunk(pending);
      micPendingBytesRef.current = new Uint8Array(0);
    }
  }, [enqueueMicChunk]);

  const handleStartMicStream = useCallback(async () => {
    if (!connected) {
      updateStatus("请先连接 WebSocket");
      return;
    }
    if (streaming || micStreaming) {
      updateStatus("已有音频流正在发送");
      return;
    }
    if (bitDepth !== 16) {
      updateStatus("麦克风实时采集当前仅支持 16-bit PCM");
      return;
    }

    const startResult = await wsStartMicStream({
      filePath: "[microphone]",
      sampleRate,
      channels,
      bitDepth,
      frameMs,
      seqStart,
      headerRules,
    });
    if (!startResult.success) {
      updateStatus(startResult.message);
      return;
    }

    try {
      const navCompat = navigator as Navigator & {
        webkitGetUserMedia?: (
          constraints: MediaStreamConstraints,
          successCallback: (stream: MediaStream) => void,
          errorCallback: (error: unknown) => void
        ) => void;
        mozGetUserMedia?: (
          constraints: MediaStreamConstraints,
          successCallback: (stream: MediaStream) => void,
          errorCallback: (error: unknown) => void
        ) => void;
        getUserMedia?: (
          constraints: MediaStreamConstraints,
          successCallback: (stream: MediaStream) => void,
          errorCallback: (error: unknown) => void
        ) => void;
      };

      const getUserMediaCompat = async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
        const modern = navCompat.mediaDevices?.getUserMedia?.bind(navCompat.mediaDevices);
        if (modern) {
          return modern(constraints);
        }

        const legacy = navCompat.getUserMedia || navCompat.webkitGetUserMedia || navCompat.mozGetUserMedia;
        if (legacy) {
          return new Promise<MediaStream>((resolve, reject) => {
            legacy.call(navCompat, constraints, resolve, reject);
          });
        }

        throw new Error("当前运行环境不支持 getUserMedia（mediaDevices 与 legacy API 均不可用）");
      };

      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error("当前运行环境不支持 AudioContext");
      }

      const mediaStream = await getUserMediaCompat({
        audio: {
          channelCount: channels,
          sampleRate,
        },
      });
      const context = new AudioContextCtor({ sampleRate });
      const source = context.createMediaStreamSource(mediaStream);
      if (!context.createScriptProcessor) {
        throw new Error("当前运行环境不支持 ScriptProcessorNode");
      }
      const processor = context.createScriptProcessor(4096, Math.max(1, channels), 1);
      const monitorGain = context.createGain();
      monitorGain.gain.value = 0;

      const bytesPerSample = bitDepth / 8;
      const frameBytes = Math.max(1, Math.floor((sampleRate * channels * bytesPerSample * frameMs) / 1000));
      micCapturingRef.current = true;

      processor.onaudioprocess = (event) => {
        if (!micCapturingRef.current) {
          return;
        }

        const input = event.inputBuffer;
        const inputChannels = input.numberOfChannels;
        const inputFrames = input.length;
        const targetChannels = Math.max(1, channels);
        const pcmBytes = new Uint8Array(inputFrames * targetChannels * 2);
        let offset = 0;
        let framePeak = 0;

        for (let i = 0; i < inputFrames; i += 1) {
          for (let ch = 0; ch < targetChannels; ch += 1) {
            let sample = 0;
            if (targetChannels === 1 && inputChannels > 1) {
              let sum = 0;
              for (let srcCh = 0; srcCh < inputChannels; srcCh += 1) {
                sum += input.getChannelData(srcCh)[i] ?? 0;
              }
              sample = sum / inputChannels;
            } else {
              const sourceChannel = Math.min(ch, inputChannels - 1);
              sample = input.getChannelData(sourceChannel)[i] ?? 0;
            }

            const clamped = Math.max(-1, Math.min(1, sample));
            framePeak = Math.max(framePeak, Math.abs(clamped));
            const value = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
            pcmBytes[offset] = value & 0xff;
            pcmBytes[offset + 1] = (value >> 8) & 0xff;
            offset += 2;
          }
        }

        setMicInputLevel((prev) => {
          const attack = 0.55;
          const decay = 0.18;
          if (framePeak >= prev) {
            return prev + (framePeak - prev) * attack;
          }
          return prev + (framePeak - prev) * decay;
        });
        setMicWaveform((prev) => {
          const next = [...prev, Math.max(0, Math.min(1, framePeak))];
          return next.length > 180 ? next.slice(next.length - 180) : next;
        });

        const pending = micPendingBytesRef.current;
        const combined = new Uint8Array(pending.length + pcmBytes.length);
        combined.set(pending, 0);
        combined.set(pcmBytes, pending.length);

        let readOffset = 0;
        while (readOffset + frameBytes <= combined.length) {
          enqueueMicChunk(combined.slice(readOffset, readOffset + frameBytes));
          readOffset += frameBytes;
        }
        micPendingBytesRef.current = combined.slice(readOffset);
      };

      source.connect(processor);
      processor.connect(monitorGain);
      monitorGain.connect(context.destination);
      if (context.state === "suspended") {
        void context.resume();
      }

      micStreamRef.current = mediaStream;
      micAudioContextRef.current = context;
      micSourceNodeRef.current = source;
      micProcessorNodeRef.current = processor;
      micMonitorGainRef.current = monitorGain;
      setMicStreaming(true);
      setStreaming(true);
      updateStatus("microphone stream started");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await releaseMicCapture();
      await wsStopMicStream();
      updateStatus(`启动麦克风失败: ${message}（请检查麦克风权限、系统隐私设置与 WebView 媒体能力）`, {
        pin: true,
        force: true,
      });
    }
  }, [
    bitDepth,
    channels,
    connected,
    frameMs,
    headerRules,
    micStreaming,
    releaseMicCapture,
    sampleRate,
    seqStart,
    setStreaming,
    streaming,
    updateStatus,
    enqueueMicChunk,
  ]);

  const handleStopMicStream = useCallback(async () => {
    try {
      micCapturingRef.current = false;
      if (micProcessorNodeRef.current) {
        micProcessorNodeRef.current.onaudioprocess = null;
      }
      flushMicPendingBytes();
      await micSendQueueRef.current.catch(() => undefined);
      await releaseMicCapture();
      const result = await wsStopMicStream();
      updateStatus(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateStatus(message);
    } finally {
      setMicStreaming(false);
      setStreaming(false);
      resetMicVisuals();
    }
  }, [flushMicPendingBytes, releaseMicCapture, resetMicVisuals, setStreaming, updateStatus]);

  return {
    micStreaming,
    micInputLevel,
    micWaveform,
    setMicStreaming,
    resetMicVisuals,
    releaseMicCapture,
    handleStartMicStream,
    handleStopMicStream,
  };
}
