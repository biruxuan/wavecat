import { useSendPanelContext } from "../../context/SendPanelContext";

export function StickyActions() {
  const {
    payloadType,
    textPayload,
    binaryPayload,
    binaryFilePath,
    pcmFilePath,
    onTextChange,
    connected,
    streaming,
    micStreaming,
    sessionProfile,
    streamStatus,
    onApplyJSONTemplate,
    onSendText,
    onSendBinary,
    onSendBinaryFile,
    onRunSession,
    onStartStream,
    onStopStream,
    onStartMicStream,
    onStopMicStream,
  } = useSendPanelContext();

  const getPrimaryAction = () => {
    if (payloadType === "binary-base64") {
      return {
        label: "Send Binary Base64",
        onClick: onSendBinary,
        disabled: !connected || binaryPayload.trim().length === 0,
        reason: !connected
          ? "当前未连接，无法发送。"
          : binaryPayload.trim().length === 0
            ? "Binary Base64 内容为空。"
            : "",
      };
    }
    if (payloadType === "binary-file") {
      return {
        label: "Send Binary File",
        onClick: onSendBinaryFile,
        disabled: !connected || binaryFilePath.trim().length === 0,
        reason: !connected
          ? "当前未连接，无法发送。"
          : binaryFilePath.trim().length === 0
            ? "尚未选择 Binary 文件。"
            : "",
      };
    }
    if (payloadType === "pcm-wav") {
      if (streaming) {
        return {
          label: "Stop Stream",
          onClick: onStopStream,
          disabled: false,
          reason: "",
          danger: true,
        };
      }
      return {
        label: "Start Stream",
        onClick: onStartStream,
        disabled: !connected || pcmFilePath.trim().length === 0,
        reason: !connected
          ? "当前未连接，无法开始推流。"
          : pcmFilePath.trim().length === 0
            ? "尚未选择 PCM/WAV 文件。"
            : "",
      };
    }

    return {
      label: "Send JSON",
      onClick: onSendText,
      disabled: !connected,
      reason: !connected ? "当前未连接，无法发送。" : "",
    };
  };

  const primaryAction = getPrimaryAction();

  return (
    <div className="sticky-actions">
      {/* ── JSON Body section ───────────────────────────── */}
      <div className="sticky-actions-header">
        <span className="panel-title">JSON Body</span>
        <div className="button-row">
          <button
            type="button"
            onClick={() => onApplyJSONTemplate(`${sessionProfile}_start`)}
          >
            Start Template
          </button>
          <button
            type="button"
            onClick={() => onApplyJSONTemplate(`${sessionProfile}_close`)}
          >
            Close Template
          </button>
        </div>
      </div>

      <textarea
        className="sticky-json-body"
        value={textPayload}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder='{"type":"translation|chat","event":"start","message_id":"${message_id}"}'
      />

      {/* ── Action buttons ──────────────────────────────── */}
      <div className="sticky-actions-buttons">
        <button
          type="button"
          disabled={primaryAction.disabled}
          onClick={primaryAction.onClick}
          className={`btn-action primary ${primaryAction.danger ? "danger" : ""}`}
        >
          {primaryAction.label}
        </button>

        {primaryAction.reason ? <div className="sticky-disable-reason">{primaryAction.reason}</div> : null}

        <button
          type="button"
          disabled={!connected}
          onClick={onRunSession}
          className="btn-action"
        >
          Run Session
        </button>

        {streaming ? (
          <button
            type="button"
            onClick={onStopStream}
            className="btn-action danger"
          >
            Stop Stream
          </button>
        ) : (
          <button
            type="button"
            disabled={!connected}
            onClick={onStartStream}
            className="btn-action"
          >
            Start Stream
          </button>
        )}

        {micStreaming ? (
          <button
            type="button"
            onClick={onStopMicStream}
            className="btn-action danger"
          >
            Stop Mic
          </button>
        ) : (
          <button
            type="button"
            disabled={!connected}
            onClick={onStartMicStream}
            className="btn-action"
          >
            Start Mic
          </button>
        )}
      </div>

      {/* ── Stream status hint ──────────────────────────── */}
      {streamStatus.running && (
        <div className="status-text">
          Stream: {streamStatus.sentFrames} frames · {streamStatus.sentBytes} bytes
          {streamStatus.lastError ? ` · Error: ${streamStatus.lastError}` : ""}
        </div>
      )}
    </div>
  );
}
