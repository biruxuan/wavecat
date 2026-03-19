import type { Frame, SessionSummary } from "../types";

type Props = {
  frame?: Frame;
  sessionSummary?: SessionSummary;
  liveText?: string;
};

export function ResponsePanel({ frame, sessionSummary, liveText }: Props) {
  return (
    <section className="panel response-panel">
      <div className="panel-title">Response Body</div>
      {!frame && !sessionSummary && !liveText ? <div className="placeholder">No inbound response yet.</div> : null}

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
