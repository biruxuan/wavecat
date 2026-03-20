import { useEffect, useMemo, useRef, useState } from "react";
import type { Frame, SessionSummary } from "../types";

const WAVEFORM_MODE_STORAGE_KEY = "wavecat.responseWaveformMode";
const SLOT_SEC = 0.05; // 50ms per waveform point
const WINDOW_SEC = 10;
const BARS_PER_WINDOW = Math.round(WINDOW_SEC / SLOT_SEC); // 200
const WAVEFORM_VIEW_WIDTH = 560;
const WAVEFORM_VIEW_HEIGHT = 128;

type Props = {
  frame?: Frame;
  sessionSummary?: SessionSummary;
  liveText?: string;
  playbackWaveform?: number[];
  playbackPositionSec?: number;
  playbackTotalDurationSec?: number;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
};

export function ResponsePanel({
  frame,
  sessionSummary,
  liveText,
  playbackWaveform = [],
  playbackPositionSec = 0,
  playbackTotalDurationSec = 0,
  collapsed = false,
  onToggleCollapsed,
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
  // Active playback: audio is enqueued AND position hasn't reached the end
  const isPlaying = playbackTotalDurationSec > 0 && playbackPositionSec < playbackTotalDurationSec - 0.01;
  const playedBars = useMemo(() => {
    if (totalBars <= 0) return 0;
    if (playbackTotalDurationSec > 0) {
      const ratio = Math.max(0, Math.min(1, playbackPositionSec / playbackTotalDurationSec));
      return ratio * totalBars;
    }
    return playbackPositionSec / SLOT_SEC;
  }, [playbackPositionSec, playbackTotalDurationSec, totalBars]);
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

  const sampleWaveformAt = (data: number[], indexFloat: number): number => {
    if (data.length === 0) return 0;
    const clamped = Math.max(0, Math.min(data.length - 1, indexFloat));
    const left = Math.floor(clamped);
    const right = Math.min(data.length - 1, left + 1);
    const frac = clamped - left;
    const lv = data[left] ?? 0;
    const rv = data[right] ?? lv;
    return lv + (rv - lv) * frac;
  };

  const viewStartInt = Math.max(0, Math.floor(windowStart));
  const viewOffsetBars = Math.max(0, windowStart - viewStartInt);
  const visibleBars = useMemo(() => {
    // +1 keeps right edge filled when we shift by fractional offset
    return playbackWaveform.slice(viewStartInt, viewStartInt + barsInView + 1);
  }, [playbackWaveform, viewStartInt, barsInView]);

  // When playback ends, sync slider to last playback position
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (wasPlayingRef.current && !isPlaying && needsSlider) {
      setManualScrollBar(Math.max(0, totalBars - BARS_PER_WINDOW));
    }
    wasPlayingRef.current = isPlaying;
  }, [isPlaying, needsSlider, totalBars]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setManualScrollBar(Number(e.target.value));
  };

  const sliderValue = isPlaying
    ? Math.max(0, Math.min(totalBars - barsInView, windowStart))
    : manualScrollBar;

  // Catmull-Rom to cubic bezier smooth path
  const smoothPath = (points: [number, number][]): string => {
    if (points.length < 2) return "";
    if (points.length === 2)
      return `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)} L${points[1][0].toFixed(2)},${points[1][1].toFixed(2)}`;
    const n = points.length;
    let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
    for (let i = 0; i < n - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(n - 1, i + 2)];
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
    }
    return d;
  };

  const renderEnvelopeWaveform = (
    bars: number[],
    cursorFloat: number,
    offsetBars = 0,
    width = WAVEFORM_VIEW_WIDTH,
    height = WAVEFORM_VIEW_HEIGHT
  ) => {
    if (bars.length === 0) {
      return (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height={height} style={{ display: "block" }} role="img" aria-label="empty received audio waveform">
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

    const cursorAmp = sampleWaveformAt(bars, cursorFloat + offsetBars);

    const upperPts: [number, number][] = bars.map((value, index) => [
      (index + 0.5 - offsetBars) * barPxWidth,
      midY - value * (maxBarHeight / 2),
    ] as [number, number]);
    const lowerPts: [number, number][] = bars.map((value, index) => [
      (index + 0.5 - offsetBars) * barPxWidth,
      midY + value * (maxBarHeight / 2),
    ] as [number, number]).reverse();

    const upperD = smoothPath(upperPts);
    const lowerD = smoothPath(lowerPts);
    // Closed fill path: upper curve → line to last lower → lower curve → close
    const fillD = upperD + ` L${lowerPts[0][0].toFixed(2)},${lowerPts[0][1].toFixed(2)} ` +
      lowerD.replace(/^M[^ ]+/, "") + " Z";

    return (
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height={height} style={{ display: "block" }} role="img" aria-label="received audio envelope waveform">
        <rect x="0" y="0" width={width} height={height} fill="rgba(255,255,255,0.04)" />
        {cursorPx >= 0 && (
          <>
            <rect x="0" y="0" width={cursorPx} height={height} fill="rgba(100,220,160,0.10)" />
            <rect x={cursorPx} y="0" width={Math.max(0, filledWidth - cursorPx)} height={height} fill="rgba(255,255,255,0.03)" />
          </>
        )}
        <line x1="0" y1={midY} x2={width} y2={midY} stroke="rgba(255,255,255,0.24)" strokeWidth="1" />
        <path d={fillD} fill="rgba(100,200,255,0.35)" stroke="rgba(100,200,255,0.95)" strokeWidth="1.1" />
        {cursorPx >= 0 && (
          <>
            <line x1={cursorPx} y1="0" x2={cursorPx} y2={height} stroke="rgba(255,204,90,0.95)" strokeWidth="1.2" />
            <circle cx={cursorPx} cy={midY - cursorAmp * (maxBarHeight / 2)} r="2.2" fill="rgba(255,204,90,0.95)" />
            <circle cx={cursorPx} cy={midY + cursorAmp * (maxBarHeight / 2)} r="2.2" fill="rgba(255,204,90,0.95)" />
          </>
        )}
      </svg>
    );
  };

  const renderScopeWaveform = (
    bars: number[],
    cursorFloat: number,
    offsetBars = 0,
    width = WAVEFORM_VIEW_WIDTH,
    height = WAVEFORM_VIEW_HEIGHT
  ) => {
    if (bars.length === 0) {
      return (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height={height} style={{ display: "block" }} role="img" aria-label="empty received audio scope waveform">
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

    const cursorAmp = sampleWaveformAt(bars, cursorFloat + offsetBars);

    const tracePts: [number, number][] = bars.map((value, index) => [
      (index + 0.5 - offsetBars) * barPxWidth,
      midY - value * maxAmp,
    ] as [number, number]);
    const traceD = smoothPath(tracePts);

    return (
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height={height} style={{ display: "block" }} role="img" aria-label="received audio scope waveform">
        <rect x="0" y="0" width={width} height={height} fill="rgba(255,255,255,0.04)" />
        {cursorPx >= 0 && (
          <>
            <rect x="0" y="0" width={cursorPx} height={height} fill="rgba(100,220,160,0.10)" />
            <rect x={cursorPx} y="0" width={Math.max(0, filledWidth - cursorPx)} height={height} fill="rgba(255,255,255,0.03)" />
          </>
        )}
        <line x1="0" y1={midY} x2={width} y2={midY} stroke="rgba(255,255,255,0.24)" strokeWidth="1" />
        <path d={traceD} fill="none" stroke="rgba(120,220,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {cursorPx >= 0 && (
          <>
            <line x1={cursorPx} y1="0" x2={cursorPx} y2={height} stroke="rgba(255,204,90,0.95)" strokeWidth="1.2" />
            <circle cx={cursorPx} cy={midY - cursorAmp * maxAmp} r="2.4" fill="rgba(255,204,90,0.95)" />
          </>
        )}
      </svg>
    );
  };

  return (
    <section className="panel response-panel">
      <div className="response-panel-header">
        <div className="panel-title">Response Body</div>
        {onToggleCollapsed && (
          <button
            type="button"
            className="connection-collapse-button"
            aria-label={collapsed ? "Expand response panel" : "Collapse response panel"}
            title={collapsed ? "Expand" : "Collapse"}
            onClick={onToggleCollapsed}
          >
            <svg
              className={`collapse-chevron${collapsed ? " is-collapsed" : ""}`}
              viewBox="0 0 12 12"
              aria-hidden="true"
            >
              <path d="M3 4.5L6 7.5L9 4.5" />
            </svg>
          </button>
        )}
      </div>
      <div className={`response-body-wrap${collapsed ? " collapsed" : ""}`}>
        <div className="response-body-inner">
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
              ? renderEnvelopeWaveform(visibleBars, cursorBarFloat, viewOffsetBars)
              : renderScopeWaveform(visibleBars, cursorBarFloat, viewOffsetBars)}
            {needsSlider && (
              <div className="waveform-slider-wrap">
                <input
                  type="range"
                  className="waveform-slider"
                  min={0}
                  max={Math.max(0, totalBars - barsInView)}
                  step="any"
                  value={sliderValue}
                  onChange={handleSliderChange}
                />
              </div>
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
        </div>
      </div>
    </section>
  );
}
