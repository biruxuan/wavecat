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

export class RealTimePCMPlayer {
  public onChunkPlaying?: (diag: PCMChunkDiagnostics) => void;
  public onRawBytes?: (bytes: Uint8Array) => void;

  private audioContext: AudioContext | null = null;
  private queue: Array<{ buffer: AudioBuffer; diagnostics: PCMChunkDiagnostics }> = [];
  private queuedDurationSec = 0;
  private nextPlaybackTime = 0;
  private scheduledSources = 0;
  private maxScheduledSources = 2;
  private minStartBufferedSec = 0.12;
  private maxQueueLength = 0;
  private previousLastSamples: number[] = [];
  private pendingBytes = new Uint8Array(0);
  private lastFormatKey = "";

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

  private ensureContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
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

    const context = this.ensureContext();
    if (context.state === "suspended") {
      await context.resume();
    }

    const channelCount = Math.max(1, channels || 1);
    const bytesPerSample = 2;
    const bytesPerFrame = bytesPerSample * channelCount;
    const resolvedSampleRate = Math.max(8000, sampleRate || 16000);
    const formatKey = `${resolvedSampleRate}/${channelCount}`;

    if (this.lastFormatKey && this.lastFormatKey !== formatKey) {
      this.pendingBytes = new Uint8Array(0);
      this.previousLastSamples = [];
      this.queue = [];
      this.queuedDurationSec = 0;
      this.scheduledSources = 0;
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
    const appliedSmoothingMs = 0;

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
        const boundaryJump = Math.abs(previousLastSample - output[0]);
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

  private async scheduleQueuedBuffers() {
    const context = this.ensureContext();
    if (context.state === "suspended") {
      await context.resume();
    }

    const now = context.currentTime;

    if (this.scheduledSources === 0 && this.queue.length > 0 && this.queuedDurationSec < this.minStartBufferedSec) {
      return;
    }

    if (this.scheduledSources === 0 && (this.nextPlaybackTime < now-0.15 || this.nextPlaybackTime > now + 1)) {
      this.nextPlaybackTime = now + 0.02;
    }

    while (this.scheduledSources < this.maxScheduledSources && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) {
        continue;
      }
      this.queuedDurationSec = Math.max(0, this.queuedDurationSec - next.buffer.duration);

      this.onChunkPlaying?.(next.diagnostics);

      const source = context.createBufferSource();
      source.buffer = next.buffer;
      source.connect(context.destination);

      const playAt = Math.max(context.currentTime + 0.02, this.nextPlaybackTime);
      source.start(playAt);
      this.nextPlaybackTime = playAt + next.buffer.duration;
      this.scheduledSources += 1;

      source.onended = () => {
        this.scheduledSources = Math.max(0, this.scheduledSources - 1);
        if (this.scheduledSources === 0 && this.queue.length === 0) {
          this.nextPlaybackTime = context.currentTime;
          this.queuedDurationSec = 0;
        }
        void this.scheduleQueuedBuffers();
      };
    }
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
