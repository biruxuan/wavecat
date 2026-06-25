import { useState } from "react";
import { useSendPanelContext } from "../../context/SendPanelContext";

export function StreamConsole() {
  const {
    pcmFilePath,
    onPcmFilePathChange,
    onPickPcmFile,
    audioFileInfo,
    sampleRate,
    channels,
    bitDepth,
    frameMs,
    seqStart,
    audioParamSource,
    onSampleRateChange,
    onChannelsChange,
    onBitDepthChange,
    onFrameMsChange,
    onSeqStartChange,
    connected,
    streaming,
    streamStatus,
    onStartStream,
    onStopStream,
    micStreaming,
    micInputLevel,
    micWaveform,
    playbackWaveform,
    onStartMicStream,
    onStopMicStream,
  } = useSendPanelContext();

  const [mode, setMode] = useState<"file" | "mic">("file");

  const bytesPerSample = bitDepth > 0 ? bitDepth / 8 : 0;
  const frameBytes =
    sampleRate > 0 && channels > 0 && bytesPerSample > 0 && frameMs > 0
      ? Math.floor((sampleRate * channels * bytesPerSample * frameMs) / 1000)
      : 0;

  const toSparkPath = (values: number[], width: number, height: number) => {
    if (!values.length) return "";
    const trimmed = values.slice(-48);
    const maxAbs = Math.max(...trimmed.map((v) => Math.abs(v)), 1);
    return trimmed
      .map((value, index) => {
        const x = (index / Math.max(trimmed.length - 1, 1)) * width;
        const y = height / 2 - (value / maxAbs) * (height * 0.42);
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  };

  return (
    <div className="sc-container">
      {/* Media source selector */}
      <div className="sc-source-row">
        <button
          type="button"
          className={`sc-source-btn ${mode === "file" ? "active" : ""}`}
          onClick={() => setMode("file")}
        >
          🎵 Audio File
        </button>
        <button
          type="button"
          className={`sc-source-btn ${mode === "mic" ? "active" : ""}`}
          onClick={() => setMode("mic")}
        >
          🎤 Microphone
        </button>
      </div>

      {/* File picker (file mode) */}
      {mode === "file" && (
        <div className="sc-file-row">
          <input
            type="text"
            className="sc-file-input"
            value={pcmFilePath}
            onChange={(e) => onPcmFilePathChange(e.target.value)}
            placeholder="/path/to/audio.wav"
          />
          <button type="button" onClick={onPickPcmFile} className="sc-file-btn">
            Browse
          </button>
          {audioFileInfo?.success && (
            <span className="sc-file-info">
              {audioFileInfo.format.toUpperCase()}
              {audioFileInfo.format === "wav" && (
                <>
                  {" · "}{audioFileInfo.sampleRate}Hz {audioFileInfo.channels}ch {audioFileInfo.bitDepth}bit
                </>
              )}
              {" · "}{(audioFileInfo.dataBytes / 1024).toFixed(1)}KB
            </span>
          )}
        </div>
      )}

      {/* Audio params */}
      <div className="sc-params-row">
        <label className="sc-param">
          <span>Sample Rate</span>
          <input
            type="number"
            value={sampleRate}
            onChange={(e) => onSampleRateChange(Number(e.target.value))}
          />
          {audioParamSource !== "Manual" && <span className="sc-param-badge">auto</span>}
        </label>
        <label className="sc-param">
          <span>Channels</span>
          <input
            type="number"
            value={channels}
            onChange={(e) => onChannelsChange(Number(e.target.value))}
          />
        </label>
        <label className="sc-param">
          <span>Bit Depth</span>
          <input
            type="number"
            value={bitDepth}
            onChange={(e) => onBitDepthChange(Number(e.target.value))}
          />
        </label>
        <label className="sc-param">
          <span>Frame ms</span>
          <input
            type="number"
            value={frameMs}
            onChange={(e) => onFrameMsChange(Number(e.target.value))}
          />
        </label>
        <label className="sc-param">
          <span>Seq Start</span>
          <input
            type="number"
            value={seqStart}
            onChange={(e) => onSeqStartChange(Number(e.target.value))}
          />
        </label>
        <label className="sc-param sc-param-readonly">
          <span>Frame Bytes</span>
          <input type="number" value={frameBytes} readOnly />
        </label>
      </div>

      {/* Control bar */}
      <div className="sc-control-row">
        {mode === "file" ? (
          streaming ? (
            <button type="button" className="sc-control-btn danger" onClick={onStopStream}>
              ⏹ Stop Stream
            </button>
          ) : (
            <button
              type="button"
              className="sc-control-btn primary"
              disabled={!connected || !pcmFilePath.trim()}
              onClick={onStartStream}
            >
              ▶ Start Stream
            </button>
          )
        ) : micStreaming ? (
          <button type="button" className="sc-control-btn danger" onClick={onStopMicStream}>
            ⏹ Stop Mic
          </button>
        ) : (
          <button
            type="button"
            className="sc-control-btn primary"
            disabled={!connected}
            onClick={onStartMicStream}
          >
            ▶ Start Mic
          </button>
        )}

        {/* Status */}
        <div className="sc-status">
          {streaming && streamStatus.running && (
            <>
              <span className="sc-status-frames">{streamStatus.sentFrames} frames</span>
              <span className="sc-status-bytes">{(streamStatus.sentBytes / 1024).toFixed(1)} KB</span>
              {streamStatus.lastError && (
                <span className="sc-status-error">{streamStatus.lastError}</span>
              )}
            </>
          )}
          {!connected && <span className="sc-status-warn">Not connected</span>}
        </div>
      </div>

      {/* Mic monitor */}
      {mode === "mic" && micStreaming && (
        <div className="sc-mic-monitor">
          <div className="sc-mic-level">
            <div className="sc-mic-level-bar" style={{ width: `${Math.min(100, micInputLevel * 100)}%` }} />
          </div>
          <svg className="sc-waveform" viewBox="0 0 240 44" preserveAspectRatio="none">
            <path d={toSparkPath(micWaveform, 240, 44)} fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      )}

      {/* Playback waveform (file streaming) */}
      {mode === "file" && streaming && playbackWaveform.length > 0 && (
        <div className="sc-mic-monitor">
          <svg className="sc-waveform" viewBox="0 0 240 44" preserveAspectRatio="none">
            <path d={toSparkPath(playbackWaveform, 240, 44)} fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      )}
    </div>
  );
}
