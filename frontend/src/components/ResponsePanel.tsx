import { useEffect, useMemo, useState } from "react";
import type { Frame, SessionSummary } from "../types";

const WAVEFORM_MODE_STORAGE_KEY = "wavecat.responseWaveformMode";
const SLOT_SEC = 0.05; // 50ms per waveform point
const WINDOW_SEC = 10;
const BARS_PER_WINDOW = Math.round(WINDOW_SEC / SLOT_SEC); // 200

type Props = {
  frame?: Frame;
  sessionSummary?: SessionSummary;
  liveText?: string;
  playbackWaveform?: number[];
  playbackPositionSec?: number;
};

export function ResponsePanel({
  frame,
  sessionSummary,
  liveText,
  playbackWaveform = [],
  playbackPositionSec = 0,
}: Props) {
  const [showWaveform, setShowWaveform] = useState(true);
  const [waveformMode, setWaveformMode] = useState<"envelope" | "scope">(() => {
    try {
      const stored = window.localStorage.getItem(WAVEFORM_MODE_STORAGE_KEY);
      return stored === "scope" ? "scope" : "envelope";
    } catch {
      return "envelope";
    }
  });
  const [manualScrollBar, setManualScrollBar] = useState(0);

  useEffect(() => {
    try {
      window.localStorage.setItem(WAVEFORM_MODE_STORAGE_KEY, waveformMode);
    } catch {
      // ignore localStorage errors
    }
  }, [waveformMode]);

  const totalBars = playbackWaveform.length;
  const needsSlider = totalBars > BARS_PER_WINDOW;
  const isPlaying = playbackPositionSec > 0;
  const playedBars = playbackPositionSec / SLOT_SEC;
  const barsInView = Math.min(BARS_PER_WINDOW, totalBars);

  // Compute window start and cursor position
  const { windowStart, cursorBarFloat } = useMemo(() => {
    if (!isPlaying) {
      return { windowStart: needsSlider ? manualScrollBar : 0, cursorBarFloat: -1 };
    }
    if (totalBars <= BARS_PER_WINDOW) {
      return { windowStart: 0, cursorBarFloat: playedBars };
    }
    const halfWindow = BARS_PER_WINDOW / 2;
    if (playedBars <= halfWindow) {
      return { windowStart: 0, cursorBarFloat: playedBars };
    }
    if (totalBars - playedBars <= halfWindow) {
      const ws = totalBars - BARS_PER_WINDOW;
      return { windowStart: ws, cursorBarFloat: playedBars - ws };
    }
    return { windowStart: playedBars - halfWindow, cursorBarFloat: halfWindow };
  }, [isPlaying, totalBars, playedBars, needsSlider, manualScrollBar]);

  const viewStartInt = Math.max(0, Math.floor(windowStart));
  const visibleBars = playbackWaveform.slice(viewStartInt, viewStartInt + barsInView);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setManualScrollBar(Number(e.target.value));
  };

  const sliderValue = isPlaying
    ? Math.max(0, Math.min(totalBars - barsInView, Math.floor(windowStart)))
    : manualScrollBar;

  const renderEnvelopeWaveform = (bars: number[], cursorFloat: number, width = 420, height = 84) => {
    if (bars.length === 0) {
      return (
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="empty received audio waveform">
          <rect x="0" y="0" width={width} height={height} fill="rgba(255,255,255,0.04)" />
          <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        </svg>
      );
    }

    const barPxWidth = width / BARS_PER_WINDOW; // each bar always same width
    const filledWidth = bars.length * barPxWidth;
    const maxBarHeight = Math.max(8, height - 8);
    const midY = height / 2;
    const cursorPx = cursorFloat >= 0 ? Math.min(filledWidth, cursorFloat * barPxWidth) : -1;

    const upper = bars
      .map((value, index) => {
        const x = index * barPxWidth + barPxWidth / 2;
        const y = midY - value * (maxBarHeight / 2);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

    const lower = bars
      .map((_, index) => {
        const ri = bars.length - 1 - index;
        const x = ri * barPxWidth + barPxWidth / 2;
        const y = midY + bars[ri] * (maxBarHeight / 2);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="received audio envelope waveform">
        <rect x="0" y="0" width={width} height={height} fill="rgba(255,255,255,0.04)" />
        {cursorPx >= 0 && (
          <>
            <rect x="0" y="0" width={cursorPx} height={height} fill="rgba(100,220,160,0.10)" />
            <rect x={cursorPx} y="0" width={Math.max(0, filledWidth - cursorPx)} height={height} fill="rgba(255,255,255,0.03)" />
          </>
        )}
        <line x1="0" y1={midY} x2={width} y2={midY} stroke="rgba(255,255,255,0.24)" strokeWidth="1" />
        <polygon points={`${upper} ${lower}`} fill="rgba(100,200,255,0.35)" stroke="rgba(100,200,255,0.95)" strokeWidth="1.1" />
        {cursorPx >= 0 && (
          <>
            <line x1={cursorPx} y1="0" x2={cursorPx} y2={height} stroke="rgba(255,204,90,0.95)" strokeWidth="1.2" />
            <circle cx={cursorPx} cy={midY - (bars[Math.min(bars.length - 1, Math.floor(cursorFloat))] ?? 0) * (maxBarHeight / 2)} r="2.2" fill="rgba(255,204,90,0.95)" />
            <circle cx={cursorPx} cy={midY + (bars[Math.min(bars.length - 1, Math.floor(cursorFloat))] ?? 0) * (maxBarHeight / 2)} r="2.2" fill="rgba(255,204,90,0.95)" />
          </>
        )}
      </svg>
    );
  };

  const renderScopeWaveform = (bars: number[], cursorFloat: number, width = 420, height = 84) => {
    if (bars.length === 0) {
      return (
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="empty received audio scope waveform">
          <rect x="0" y="0" width={width} height={height} fill="rgba(255,255,255,0.04)" />
          <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        </svg>
      );
    }

    const barPxWidth = width / BARS_PER_WINDOW;
    const filledWidth = bars.length * barPxWidth;
    const midY = height / 2;
    const maxAmp = Math.max(8, (height - 8) / 2);
    const cursorPx = cursorFloat >= 0 ? Math.min(filledWidth, cursorFloat * barPxWidth) : -1;

    const trace = bars
      .map((value, index) => {
        const x = index * barPxWidth + barPxWidth / 2;
        const y = midY - value * maxAmp;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="received audio scope waveform">
        <rect x="0" y="0" width={width} height={height} fill="rgba(255,255,255,0.04)" />
        {cursorPx >= 0 && (
          <>
            <rect x="0" y="0" width={cursorPx} height={height} fill="rgba(100,220,160,0.10)" />
            <rect x={cursorPx} y="0" width={Math.max(0, filledWidth - cursorPx)} height={height} fill="rgba(255,255,255,0.03)" />
          </>
        )}
        <line x1="0" y1={midY} x2={width} y2={midY} stroke="rgba(255,255,255,0.24)" strokeWidth="1" />
        <polyline points={trace} fill="none" stroke="rgba(120,220,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {cursorPx >= 0 && (
          <>
            <line x1={cursorPx} y1="0" x2={cursorPx} y2={height} stroke="rgba(255,204,90,0.95)" strokeWidth="1.2" />
            <circle cx={cursorPx} cy={midY - (bars[Math.min(bars.length - 1, Math.floor(cursorFloat))] ?? 0) * maxAmp} r="2.4" fill="rgba(255,204,90,0.95)" />
          </>
        )}
      </svg>
    );
  };

  return (
    <section className="panel response-panel">
      <div className="panel-title">Response Body</div>
      {!frame && !sessionSummary && !liveText ? <div className="placeholder">No inbound response yet.</div> : null}

      <div className="live-text-block">
        <div className="waveform-header">
          <div className="live-text-label">Received Audio Waveform</div>
          <div className="waveform-actions">
            <div className="waveform-mode-group" role="group" aria-label="Waveform mode">
              <button
                type="button"
                className={waveformMode === "envelope" ? "waveform-mode-button active" : "waveform-mode-button"}
                onClick={() => setWaveformMode("envelope")}
              >
                Envelope
              </button>
              <button
                type="button"
                className={waveformMode === "scope" ? "waveform-mode-button active" : "waveform-mode-button"}
                onClick={() => setWaveformMode("scope")}
              >
                Scope
              </button>
            </div>
            <button type="button" className="waveform-toggle" onClick={() => setShowWaveform((prev) => !prev)}>
              {showWaveform ? "Hide Waveform" : "Show Waveform"}
            </button>
          </div>
        </div>
        {showWaveform && (
          <>
            {waveformMode === "envelope"
              ? renderEnvelopeWaveform(visibleBars, cursorBarFloat)
              : renderScopeWaveform(visibleBars, cursorBarFloat)}
            {needsSlider && (
              <input
                type="range"
                className="waveform-slider"
                min={0}
                max={Math.max(0, totalBars - barsInView)}
                value={sliderValue}
                onChange={handleSliderChange}
                disabled={isPlaying}
              />
            )}
          </>
        )}
      </div>

      {liveText ? (
        <div className="live-text-block">
          <div className="live-text-label">Assistant Response</div>
          <pre className="live-text">{liveText}</pre>
        </div>
      ) : null}

      {sessionSummary ? (
        <>
          <h4>Session Summary</h4>
          <div className="detail-meta">
            <span>Profile: {sessionSummary.profileType}</span>
            <span>Status: {sessionSummary.status || "idle"}</span>
            {sessionSummary.error ? <span>Error: {sessionSummary.error}</span> : null}
            {sessionSummary.startedFrame ? <span>Started Frame: {sessionSummary.startedFrame.id}</span> : null}
            {sessionSummary.finalFrame ? <span>Final Frame: {sessionSummary.finalFrame.id}</span> : null}
            {sessionSummary.sessionFinishedFrame ? <span>Session Finished Frame: {sessionSummary.sessionFinishedFrame.id}</span> : null}
            {typeof sessionSummary.extractedAudioChunks === "number" ? <span>Audio Chunks: {sessionSummary.extractedAudioChunks}</span> : null}
            {typeof sessionSummary.extractedAudioBytes === "number" ? <span>Audio Bytes: {sessionSummary.extractedAudioBytes}</span> : null}
          </div>

          {sessionSummary.extractedText ? (
            <>
              <h4>Extracted Text</h4>
              <pre>{sessionSummary.extractedText}</pre>
            </>
          ) : null}

          {sessionSummary.finalFrame?.text ? (
            <>
              <h4>Final Event / JSON</h4>
              <pre>{sessionSummary.finalFrame.text}</pre>
            </>
          ) : null}

          {sessionSummary.sessionFinishedFrame?.text ? (
            <>
              <h4>Session Finished / JSON</h4>
              <pre>{sessionSummary.sessionFinishedFrame.text}</pre>
            </>
          ) : null}
        </>
      ) : null}

      {frame ? (
        <>
          <div className="detail-meta">
            <span>ID: {frame.id}</span>
            <span>Type: {frame.type}</span>
            <span>Size: {frame.size}</span>
            <span>Time: {new Date(frame.timestamp).toLocaleTimeString()}</span>
          </div>
          <h4>Summary</h4>
          <pre>{frame.summary}</pre>

          {frame.text ? (
            <>
              <h4>Text / JSON</h4>
              <pre>{frame.text}</pre>
            </>
          ) : null}

          {frame.hex ? (
            <>
              <h4>HEX</h4>
              <pre>{frame.hex}</pre>
            </>
          ) : null}

          {frame.ascii ? (
            <>
              <h4>ASCII</h4>
              <pre>{frame.ascii}</pre>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
