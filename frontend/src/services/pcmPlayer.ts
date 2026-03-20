export type PCMChunkDiagnostics = {
  bytes: number;
  frameCount: number;
  durationMs: number;
  sampleRate: number;
  channels: number;
  rms: number;
  peak: number;
  remainderBytes: number;
  pendingBytes: number;
  boundaryJump: number;
  smoothingMs: number;
};

export type PCMPlaybackState = {
  queueLength: number;
  scheduledSources: number;
};

export type PCMPlaybackTiming = {
  remainingSec: number;
  currentTimeSec: number;
  nextPlaybackTimeSec: number;
};

export class RealTimePCMPlayer {
  public onChunkPlaying?: (diag: PCMChunkDiagnostics) => void;
  public onRawBytes?: (bytes: Uint8Array) => void;

  private audioContext: AudioContext | null = null;
  private queue: Array<{ buffer: AudioBuffer; diagnostics: PCMChunkDiagnostics }> = [];
  private queuedDurationSec = 0;
  private nextPlaybackTime = 0;
  private scheduledSources = 0;
  private maxScheduledSources = 4;
  private minStartBufferedSec = 0.12;
  private maxQueueLength = 0;
  private previousLastSamples: number[] = [];
  private pendingBytes = new Uint8Array(0);
  private lastFormatKey = "";
  private boundaryCrossfadeMs = 0;
  private adaptiveRateEnabled = true;
  private adaptiveRateMin = 0.985;
  private adaptiveRateMax = 1.015;
  private adaptiveTargetQueueSec = 0.24;
  private adaptiveDeadbandSec = 0.08;
  private adaptiveRateStrength = 1;
  private activeSources = new Set<AudioBufferSourceNode>();
  private playbackStartTimers = new Set<number>();
  private chunkSchedule: Array<{ startSec: number; endSec: number; audioDurSec: number }> = [];
  private totalEnqueuedDurationSec = 0;

  setMaxScheduledSources(value: number) {
    const next = Number.isFinite(value) ? Math.floor(value) : 2;
    this.maxScheduledSources = Math.max(1, Math.min(10, next));
  }

  setMinStartBufferedMs(value: number) {
    const next = Number.isFinite(value) ? value : 120;
    this.minStartBufferedSec = Math.max(0, Math.min(2, next / 1000));
  }

  setMaxQueueLength(value: number) {
    const next = Number.isFinite(value) ? Math.floor(value) : 0;
    this.maxQueueLength = Math.max(0, next);
    if (this.maxQueueLength > 0 && this.queue.length > this.maxQueueLength) {
      this.queue.splice(0, this.queue.length - this.maxQueueLength);
    }
  }

  setBoundaryCrossfadeMs(value: number) {
    const next = Number.isFinite(value) ? value : 4;
    this.boundaryCrossfadeMs = Math.max(0, Math.min(12, next));
  }

  setAdaptiveRateEnabled(value: boolean) {
    this.adaptiveRateEnabled = !!value;
  }

  setAdaptiveRateStrength(value: number) {
    const next = Number.isFinite(value) ? value : 1;
    this.adaptiveRateStrength = Math.max(0, Math.min(2, next));
  }

  private ensureContext(targetSampleRate?: number) {
    if (this.audioContext && targetSampleRate && this.audioContext.sampleRate !== targetSampleRate) {
      this.stopNow();
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    if (!this.audioContext) {
      this.audioContext = new AudioContext(
        targetSampleRate ? { sampleRate: targetSampleRate } : undefined
      );
      this.nextPlaybackTime = this.audioContext.currentTime;
    }
    return this.audioContext;
  }

  async unlock() {
    const context = this.ensureContext();
    if (context.state === "suspended") {
      await context.resume();
    }
  }

  async enqueuePCM16Base64(base64: string, sampleRate: number, channels: number): Promise<PCMChunkDiagnostics | null> {
    const normalized = base64.replace(/\s/g, "");
    if (!normalized) {
      return null;
    }

    const channelCount = Math.max(1, channels || 1);
    const bytesPerSample = 2;
    const bytesPerFrame = bytesPerSample * channelCount;
    const resolvedSampleRate = Math.max(8000, sampleRate || 16000);

    const context = this.ensureContext(resolvedSampleRate);
    if (context.state === "suspended") {
      await context.resume();
    }
    const formatKey = `${resolvedSampleRate}/${channelCount}`;

    if (this.lastFormatKey && this.lastFormatKey !== formatKey) {
      this.stopNow();
    }
    this.lastFormatKey = formatKey;

    let bytes = this.base64ToBytes(normalized);
    if (this.pendingBytes.length > 0) {
      const combined = new Uint8Array(this.pendingBytes.length + bytes.length);
      combined.set(this.pendingBytes, 0);
      combined.set(bytes, this.pendingBytes.length);
      bytes = combined;
      this.pendingBytes = new Uint8Array(0);
    }

    const alignedLength = Math.floor(bytes.length / bytesPerFrame) * bytesPerFrame;
    const remainderBytes = bytes.length - alignedLength;
    if (remainderBytes > 0) {
      this.pendingBytes = bytes.slice(alignedLength);
    }

    if (alignedLength <= 0) {
      return null;
    }

    const decodeBytes = bytes.subarray(0, alignedLength);
    this.onRawBytes?.(decodeBytes.slice());
    const frameCount = alignedLength / bytesPerFrame;

    const audioBuffer = context.createBuffer(channelCount, frameCount, resolvedSampleRate);
    let squareSum = 0;
    let peak = 0;
    let sampleCounter = 0;
    let maxBoundaryJump = 0;
    let appliedSmoothingMs = 0;

    const requestedFadeSamples = Math.floor((resolvedSampleRate * this.boundaryCrossfadeMs) / 1000);
    const fadeSamples = Math.max(0, Math.min(requestedFadeSamples, Math.floor(frameCount / 2)));
    if (fadeSamples > 0) {
      appliedSmoothingMs = (fadeSamples * 1000) / resolvedSampleRate;
    }

    for (let channel = 0; channel < channelCount; channel += 1) {
      const output = audioBuffer.getChannelData(channel);
      const previousLastSample = this.previousLastSamples[channel];
      for (let i = 0; i < frameCount; i += 1) {
        const offset = (i * channelCount + channel) * bytesPerSample;
        const lo = decodeBytes[offset] ?? 0;
        const hi = decodeBytes[offset + 1] ?? 0;
        let sample = (hi << 8) | lo;
        if (sample >= 0x8000) {
          sample -= 0x10000;
        }
        const normalizedSample = Math.max(-1, Math.min(1, sample / 32768));
        output[i] = normalizedSample;
        squareSum += normalizedSample * normalizedSample;
        peak = Math.max(peak, Math.abs(normalizedSample));
        sampleCounter += 1;
      }

      if (typeof previousLastSample === "number" && frameCount > 0) {
        const rawBoundaryJump = Math.abs(previousLastSample - output[0]);
        if (fadeSamples > 0) {
          for (let i = 0; i < fadeSamples; i += 1) {
            const ratio = (i + 1) / (fadeSamples + 1);
            output[i] = previousLastSample * (1 - ratio) + output[i] * ratio;
          }
        }
        const boundaryJump = Math.abs(previousLastSample - output[0]);
        maxBoundaryJump = Math.max(maxBoundaryJump, Math.min(rawBoundaryJump, boundaryJump));
      } else if (frameCount > 0) {
        if (fadeSamples > 0) {
          for (let i = 0; i < fadeSamples; i += 1) {
            const ratio = (i + 1) / (fadeSamples + 1);
            output[i] = output[i] * ratio;
          }
        }
        const boundaryJump = Math.abs(output[0]);
        maxBoundaryJump = Math.max(maxBoundaryJump, boundaryJump);
      }

      this.previousLastSamples[channel] = output[frameCount - 1] ?? 0;
    }

    const rms = sampleCounter > 0 ? Math.sqrt(squareSum / sampleCounter) : 0;
    const diagnostics = {
      bytes: alignedLength,
      frameCount,
      durationMs: audioBuffer.duration * 1000,
      sampleRate: resolvedSampleRate,
      channels: channelCount,
      rms,
      peak,
      remainderBytes,
      pendingBytes: this.pendingBytes.length,
      boundaryJump: maxBoundaryJump,
      smoothingMs: appliedSmoothingMs,
    };

    this.queue.push({ buffer: audioBuffer, diagnostics });
    this.queuedDurationSec += audioBuffer.duration;
    this.totalEnqueuedDurationSec += audioBuffer.duration;
    if (this.maxQueueLength > 0 && this.queue.length > this.maxQueueLength) {
      const overflow = this.queue.length - this.maxQueueLength;
      for (let i = 0; i < overflow; i += 1) {
        const dropped = this.queue.shift();
        if (dropped) {
          this.queuedDurationSec = Math.max(0, this.queuedDurationSec - dropped.buffer.duration);
        }
      }
    }
    void this.scheduleQueuedBuffers();
    return diagnostics;
  }

  getPlaybackState(): PCMPlaybackState {
    return {
      queueLength: this.queue.length,
      scheduledSources: this.scheduledSources,
    };
  }

  getPlaybackTiming(): PCMPlaybackTiming {
    if (!this.audioContext) {
      return {
        remainingSec: 0,
        currentTimeSec: 0,
        nextPlaybackTimeSec: 0,
      };
    }
    const current = this.audioContext.currentTime;
    return {
      remainingSec: Math.max(0, this.nextPlaybackTime - current),
      currentTimeSec: current,
      nextPlaybackTimeSec: this.nextPlaybackTime,
    };
  }

  stopNow() {
    for (const timer of this.playbackStartTimers) {
      window.clearTimeout(timer);
    }
    this.playbackStartTimers.clear();

    for (const source of this.activeSources) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {
        // ignore stop/disconnect errors
      }
    }
    this.activeSources.clear();

    this.queue = [];
    this.pendingBytes = new Uint8Array(0);
    this.previousLastSamples = [];
    this.queuedDurationSec = 0;
    this.scheduledSources = 0;
    this.lastFormatKey = "";
    this.chunkSchedule = [];
    this.totalEnqueuedDurationSec = 0;

    if (this.audioContext) {
      this.nextPlaybackTime = this.audioContext.currentTime;
    } else {
      this.nextPlaybackTime = 0;
    }
  }

  private async scheduleQueuedBuffers() {
    const context = this.ensureContext();
    if (context.state === "suspended") {
      await context.resume();
    }

    const now = context.currentTime;

    if (this.scheduledSources === 0 && this.queue.length > 0 && this.queuedDurationSec < this.minStartBufferedSec) {
      return;
    }

    if (this.scheduledSources === 0 && (this.nextPlaybackTime < now - 0.15 || this.nextPlaybackTime > now + 1)) {
      this.nextPlaybackTime = now + 0.005;
    }

    const batchRate = this.resolveAdaptivePlaybackRate();

    while (this.scheduledSources < this.maxScheduledSources && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) {
        continue;
      }
      this.queuedDurationSec = Math.max(0, this.queuedDurationSec - next.buffer.duration);

      const source = context.createBufferSource();
      source.buffer = next.buffer;
      source.playbackRate.value = batchRate;
      source.connect(context.destination);

      const playAt = Math.max(context.currentTime + 0.005, this.nextPlaybackTime);
      const startDelayMs = Math.max(0, (playAt - context.currentTime) * 1000);
      const playbackStartTimer = window.setTimeout(() => {
        this.playbackStartTimers.delete(playbackStartTimer);
        this.onChunkPlaying?.(next.diagnostics);
      }, startDelayMs);
      this.playbackStartTimers.add(playbackStartTimer);

      source.start(playAt);
      this.nextPlaybackTime = playAt + next.buffer.duration / source.playbackRate.value;
      this.chunkSchedule.push({ startSec: playAt, endSec: this.nextPlaybackTime, audioDurSec: next.buffer.duration });
      this.scheduledSources += 1;
      this.activeSources.add(source);

      source.onended = () => {
        if (this.playbackStartTimers.has(playbackStartTimer)) {
          window.clearTimeout(playbackStartTimer);
          this.playbackStartTimers.delete(playbackStartTimer);
        }
        this.activeSources.delete(source);
        this.scheduledSources = Math.max(0, this.scheduledSources - 1);
        if (this.scheduledSources === 0 && this.queue.length === 0) {
          this.queuedDurationSec = 0;
          this.previousLastSamples = [];
        }
        void this.scheduleQueuedBuffers();
      };
    }
  }

  private resolveAdaptivePlaybackRate() {
    if (!this.adaptiveRateEnabled) {
      return 1;
    }

    const delta = this.queuedDurationSec - this.adaptiveTargetQueueSec;
    if (Math.abs(delta) <= this.adaptiveDeadbandSec) {
      return 1;
    }

    const normalized = Math.max(-1, Math.min(1, delta / Math.max(0.001, this.adaptiveTargetQueueSec)));
    const baseStep = 0.005 * this.adaptiveRateStrength;
    const rate = 1 + normalized * baseStep;
    const dynamicMin = Math.max(0.985, 1 - baseStep);
    const dynamicMax = Math.min(1.015, 1 + baseStep);
    const clampedByDynamic = Math.max(dynamicMin, Math.min(dynamicMax, rate));
    return Math.max(this.adaptiveRateMin, Math.min(this.adaptiveRateMax, clampedByDynamic));
  }

  getSmoothedPlaybackIndex(): number {
    if (!this.audioContext || this.chunkSchedule.length === 0) return 0;
    const now = this.audioContext.currentTime;
    for (let i = 0; i < this.chunkSchedule.length; i++) {
      const chunk = this.chunkSchedule[i];
      if (now < chunk.startSec) {
        return i;
      }
      if (now < chunk.endSec) {
        const frac = (now - chunk.startSec) / Math.max(0.001, chunk.endSec - chunk.startSec);
        return i + Math.min(1, frac);
      }
    }
    return this.chunkSchedule.length;
  }

  getPlaybackPositionSec(): number {
    if (!this.audioContext || this.chunkSchedule.length === 0) return 0;
    const now = this.audioContext.currentTime;
    let accum = 0;
    for (const chunk of this.chunkSchedule) {
      if (now < chunk.startSec) return accum;
      if (now < chunk.endSec) {
        const frac = (now - chunk.startSec) / Math.max(0.001, chunk.endSec - chunk.startSec);
        return accum + frac * chunk.audioDurSec;
      }
      accum += chunk.audioDurSec;
    }
    return accum;
  }

  getTotalEnqueuedDurationSec(): number {
    return this.totalEnqueuedDurationSec;
  }

  private base64ToBytes(base64: string) {
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) {
      bytes[i] = raw.charCodeAt(i);
    }
    return bytes;
  }
}
