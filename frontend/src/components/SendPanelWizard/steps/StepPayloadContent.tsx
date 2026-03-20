import { useSendPanelContext } from "../../../context/SendPanelContext";

const LABEL_MAP = {
  "json":          "JSON Body",
  "binary-base64": "Binary Base64",
  "binary-file":   "Binary File",
  "pcm-wav":       "PCM / WAV File",
} as const;

export function StepPayloadContent() {
  const {
    sessionProfile,
    payloadType,
    binaryPayload, onBinaryChange,
    binaryFilePath, onBinaryFilePathChange, onPickBinaryFile,
    pcmFilePath, onPcmFilePathChange, onPickPcmFile,
    audioFileInfo,
    translationFromLanguage,
    translationToLanguagesText,
    onTranslationFromLanguageChange,
    onTranslationToLanguagesChange,
    onApplyTranslationLanguagePreset,
    setStepErrors,
    setCurrentStep,
  } = useSendPanelContext();

  const validateStep = (): { ok: boolean; reason?: string } => {
    if (payloadType === "binary-base64" && binaryPayload.trim().length === 0) {
      return { ok: false, reason: "Binary Base64 内容为空，请先填写 payload。" };
    }
    if (payloadType === "binary-file" && binaryFilePath.trim().length === 0) {
      return { ok: false, reason: "未选择 Binary 文件，请先选择文件路径。" };
    }
    if (payloadType === "pcm-wav" && pcmFilePath.trim().length === 0) {
      return { ok: false, reason: "未选择 PCM/WAV 文件，请先选择文件路径。" };
    }
    return { ok: true };
  };

  const validation = validateStep();

  const goNext = () => {
    if (!validation.ok) {
      setStepErrors((prev) => ({ ...prev, 3: [validation.reason ?? "请补全当前步骤必填项"] }));
      return;
    }
    setStepErrors((prev) => ({ ...prev, 3: [] }));
    setCurrentStep(4);
  };

  return (
    <div className="wizard-step-body">
      <h2 className="wizard-step-title">3. {LABEL_MAP[payloadType]} Content</h2>
      <p className="wizard-step-desc">
        {payloadType === "json" &&
          "The JSON body is always visible in the right panel. Use templates to fill in event structures quickly."}
        {payloadType === "binary-base64" &&
          "Enter the Base64-encoded bytes to send as a binary frame."}
        {payloadType === "binary-file" &&
          "Select a local binary file. Its contents will be sent as a single binary frame."}
        {payloadType === "pcm-wav" &&
          "Select a PCM or WAV audio file. Configure frame size and header rules in the Advanced step."}
      </p>

      {/* ── Binary Base64 ──────────────────────────────── */}
      {payloadType === "binary-base64" && (
        <label className="field">
          <span>Base64 Payload</span>
          <textarea
            value={binaryPayload}
            onChange={(e) => onBinaryChange(e.target.value)}
            placeholder="aGVsbG8="
            rows={5}
          />
        </label>
      )}

      {/* ── Binary File ────────────────────────────────── */}
      {payloadType === "binary-file" && (
        <label className="field">
          <span>File Path</span>
          <div className="path-row">
            <input
              value={binaryFilePath}
              onChange={(e) => onBinaryFilePathChange(e.target.value)}
              placeholder="/absolute/path/to/payload.bin"
            />
            <button type="button" onClick={onPickBinaryFile}>
              Choose File
            </button>
          </div>
        </label>
      )}

      {/* ── PCM / WAV File ─────────────────────────────── */}
      {payloadType === "pcm-wav" && (
        <>
          <label className="field">
            <span>Audio File Path</span>
            <div className="path-row">
              <input
                value={pcmFilePath}
                onChange={(e) => onPcmFilePathChange(e.target.value)}
                placeholder="/absolute/path/to/audio.pcm or audio.wav"
              />
              <button type="button" onClick={onPickPcmFile}>
                Choose File
              </button>
            </div>
          </label>

          {audioFileInfo?.success && (
            <div className="wizard-info-block">
              <span className="wizard-info-label">Detected audio info</span>
              <div className="wizard-info-row">
                <span>{audioFileInfo.format.toUpperCase()}</span>
                {audioFileInfo.format === "wav" && (
                  <>
                    <span>{audioFileInfo.sampleRate} Hz</span>
                    <span>{audioFileInfo.channels} ch</span>
                    <span>{audioFileInfo.bitDepth} bit</span>
                  </>
                )}
                <span>{audioFileInfo.dataBytes.toLocaleString()} bytes</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── JSON mode hint ────────────────────────────── */}
      {payloadType === "json" && (
        <div className="wizard-info-block">
          The JSON body editor is always visible in the right panel. You may proceed to
          configure advanced options or jump directly to Review.
        </div>
      )}

      {sessionProfile === "translation" ? (
        <div className="wizard-section">
          <div className="wizard-section-title">Translation Languages</div>
          <div className="audio-grid">
            <label className="field">
              <span>From Language</span>
              <input
                value={translationFromLanguage}
                onChange={(e) => onTranslationFromLanguageChange(e.target.value)}
                placeholder="zh-CN"
              />
            </label>
            <label className="field">
              <span>To Languages</span>
              <input
                value={translationToLanguagesText}
                onChange={(e) => onTranslationToLanguagesChange(e.target.value)}
                placeholder="en-US, ja-JP"
              />
            </label>
          </div>
          <div className="button-row button-row-wrap">
            <button type="button" onClick={() => onApplyTranslationLanguagePreset("zh-CN", ["en-US"])}>
              zh-CN → en-US
            </button>
            <button type="button" onClick={() => onApplyTranslationLanguagePreset("zh-CN", ["ja-JP"])}>
              zh-CN → ja-JP
            </button>
            <button type="button" onClick={() => onApplyTranslationLanguagePreset("en-US", ["zh-CN"])}>
              en-US → zh-CN
            </button>
          </div>
        </div>
      ) : null}

      {!validation.ok ? <div className="wizard-inline-error">{validation.reason}</div> : null}

      <div className="wizard-step-nav">
        <button type="button" className="btn-nav" onClick={() => setCurrentStep(2)}>
          ← Back
        </button>
        <button
          type="button"
          className="btn-nav primary"
          disabled={!validation.ok}
          onClick={goNext}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
