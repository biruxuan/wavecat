import { useSendPanelContext } from "../../../context/SendPanelContext";

const PAYLOAD_LABEL = {
  "json":          "JSON Body",
  "binary-base64": "Binary Base64",
  "binary-file":   "Binary File",
  "pcm-wav":       "PCM / WAV Stream",
} as const;

export function StepReview() {
  const {
    sessionProfile,
    payloadType,
    textPayload,
    binaryPayload,
    binaryFilePath,
    pcmFilePath,
    sampleRate, channels, bitDepth, frameMs, seqStart,
    headerRules,
    translationFromLanguage,
    translationToLanguagesText,
    connected,
    streaming,
    micStreaming,
    setCurrentStep,
    onSendText,
    onSendBinary,
    onSendBinaryFile,
    onStartStream,
    onStopStream,
    onStartMicStream,
    onStopMicStream,
    onRunSession,
  } = useSendPanelContext();

  const reviewIssues: { key: string; message: string; step: number }[] = [];

  if (!connected) {
    reviewIssues.push({
      key: "not-connected",
      message: "当前未连接 WebSocket，发送与推流操作不可用。",
      step: 1,
    });
  }

  if (sessionProfile === "translation") {
    if (!translationFromLanguage.trim()) {
      reviewIssues.push({
        key: "translation-from",
        message: "Translation 模式缺少 From Language。",
        step: 1,
      });
    }
    if (!translationToLanguagesText.trim()) {
      reviewIssues.push({
        key: "translation-to",
        message: "Translation 模式缺少 To Languages。",
        step: 3,
      });
    }
  }

  if (payloadType === "binary-base64" && !binaryPayload.trim()) {
    reviewIssues.push({
      key: "binary-base64-empty",
      message: "Binary Base64 内容为空。",
      step: 3,
    });
  }

  if (payloadType === "binary-file" && !binaryFilePath.trim()) {
    reviewIssues.push({
      key: "binary-file-empty",
      message: "未选择 Binary 文件路径。",
      step: 3,
    });
  }

  if (payloadType === "pcm-wav" && !pcmFilePath.trim()) {
    reviewIssues.push({
      key: "pcm-file-empty",
      message: "未选择 PCM/WAV 文件路径。",
      step: 3,
    });
  }

  const bytesPerSample = bitDepth > 0 ? bitDepth / 8 : 0;
  const frameBytes =
    sampleRate > 0 && channels > 0 && bytesPerSample > 0 && frameMs > 0
      ? Math.floor((sampleRate * channels * bytesPerSample * frameMs) / 1000)
      : 0;

  return (
    <div className="wizard-step-body">
      <h2 className="wizard-step-title">5. Review &amp; Send</h2>
      <p className="wizard-step-desc">
        Verify the configuration before sending. Use the action buttons on the right
        panel or the shortcuts below.
      </p>

      {reviewIssues.length > 0 ? (
        <div className="review-issues-box">
          <div className="review-issues-title">发现 {reviewIssues.length} 项待处理问题</div>
          <div className="review-issues-list">
            {reviewIssues.map((issue) => (
              <div key={issue.key} className="review-issue-item">
                <span className="review-issue-message">{issue.message}</span>
                <button
                  type="button"
                  className="review-issue-action"
                  onClick={() => setCurrentStep(issue.step)}
                >
                  前往 Step {issue.step}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="review-ready-box">配置检查通过，可直接执行发送或推流。</div>
      )}

      {/* ── Mode ─────────────────────────────────────── */}
      <div className="review-block">
        <div className="review-block-title">
          Mode
          <button type="button" className="review-edit-btn" onClick={() => setCurrentStep(1)}>
            Edit
          </button>
        </div>
        <div className="review-block-value">{sessionProfile}</div>
        {sessionProfile === "translation" && (
          <div className="review-block-sub">
            {translationFromLanguage} → {translationToLanguagesText || "(not set)"}
          </div>
        )}
      </div>

      {/* ── Payload Type ─────────────────────────────── */}
      <div className="review-block">
        <div className="review-block-title">
          Payload Type
          <button type="button" className="review-edit-btn" onClick={() => setCurrentStep(2)}>
            Edit
          </button>
        </div>
        <div className="review-block-value">{PAYLOAD_LABEL[payloadType]}</div>
      </div>

      {/* ── Payload Content ───────────────────────────── */}
      <div className="review-block">
        <div className="review-block-title">
          Payload Content
          <button type="button" className="review-edit-btn" onClick={() => setCurrentStep(3)}>
            Edit
          </button>
        </div>
        {payloadType === "json" && (
          <div className="review-block-preview">
            {textPayload.trim() ? textPayload.slice(0, 120) + (textPayload.length > 120 ? "…" : "") : "(empty)"}
          </div>
        )}
        {payloadType === "binary-base64" && (
          <div className="review-block-value">{binaryPayload.trim() || "(empty)"}</div>
        )}
        {payloadType === "binary-file" && (
          <div className="review-block-value">{binaryFilePath.trim() || "(no file selected)"}</div>
        )}
        {payloadType === "pcm-wav" && (
          <div className="review-block-value">{pcmFilePath.trim() || "(no file selected)"}</div>
        )}
      </div>

      {/* ── Audio Params (pcm-wav only) ──────────────── */}
      {payloadType === "pcm-wav" && (
        <div className="review-block">
          <div className="review-block-title">
            Audio Parameters
            <button type="button" className="review-edit-btn" onClick={() => setCurrentStep(4)}>
              Edit
            </button>
          </div>
          <div className="review-block-chip-row">
            <span className="review-chip">{sampleRate} Hz</span>
            <span className="review-chip">{channels} ch</span>
            <span className="review-chip">{bitDepth} bit</span>
            <span className="review-chip">{frameMs} ms</span>
            <span className="review-chip">{frameBytes} B/frame</span>
            <span className="review-chip">seq from {seqStart}</span>
          </div>
        </div>
      )}

      {/* ── Header Rules ──────────────────────────────── */}
      <div className="review-block">
        <div className="review-block-title">
          Header Rules ({headerRules.length})
          <button type="button" className="review-edit-btn" onClick={() => setCurrentStep(4)}>
            Edit
          </button>
        </div>
        {headerRules.length === 0 ? (
          <div className="review-block-sub">No header rules — raw payload will be sent.</div>
        ) : (
          <div className="review-block-chip-row">
            {headerRules.map((r, i) => (
              <span key={i} className="review-chip">{r.name} ({r.type}, {r.length}B)</span>
            ))}
          </div>
        )}
      </div>

      {/* ── Send shortcuts ────────────────────────────── */}
      <div className="wizard-section-title" style={{ marginTop: 16 }}>Send Actions</div>
      <div className="button-row button-row-wrap">
        {payloadType === "json" && (
          <button type="button" disabled={!connected} onClick={onSendText} className="btn-action primary">
            Send JSON
          </button>
        )}
        {payloadType === "binary-base64" && (
          <button type="button" disabled={!connected} onClick={onSendBinary} className="btn-action primary">
            Send Binary Base64
          </button>
        )}
        {payloadType === "binary-file" && (
          <button
            type="button"
            disabled={!connected || !binaryFilePath.trim()}
            onClick={onSendBinaryFile}
            className="btn-action primary"
          >
            Send Binary File
          </button>
        )}
        {payloadType === "pcm-wav" && (
          streaming ? (
            <button type="button" onClick={onStopStream} className="btn-action danger">Stop Stream</button>
          ) : (
            <button type="button" disabled={!connected} onClick={onStartStream} className="btn-action primary">
              Start Stream
            </button>
          )
        )}
        <button type="button" disabled={!connected} onClick={onRunSession} className="btn-action">
          Run Session
        </button>
        {micStreaming ? (
          <button type="button" onClick={onStopMicStream} className="btn-action danger">Stop Mic</button>
        ) : (
          <button type="button" disabled={!connected} onClick={onStartMicStream} className="btn-action">
            Start Mic
          </button>
        )}
      </div>

      <div className="wizard-step-nav">
        <button type="button" className="btn-nav" onClick={() => setCurrentStep(4)}>
          ← Back
        </button>
      </div>
    </div>
  );
}
