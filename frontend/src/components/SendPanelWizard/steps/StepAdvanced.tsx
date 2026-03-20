import { useMemo, useState } from "react";
import { useSendPanelContext } from "../../../context/SendPanelContext";

export function StepAdvanced() {
  const {
    sampleRate, onSampleRateChange,
    channels, onChannelsChange,
    bitDepth, onBitDepthChange,
    frameMs, onFrameMsChange,
    seqStart, onSeqStartChange,
    audioParamSource,
    headerConfigSource,
    headerRules, onHeaderRulesChange,
    headerTemplates,
    onSaveHeaderTemplate,
    onLoadHeaderTemplate,
    onRenameHeaderTemplate,
    onDeleteHeaderTemplate,
    micStreaming,
    micInputLevel,
    micWaveform,
    playbackWaveform,
    expandedHeaderRuleIds, setExpandedHeaderRuleIds,
    setCurrentStep,
  } = useSendPanelContext();
  const [showMicMonitor, setShowMicMonitor] = useState(false);

  const bytesPerSample = bitDepth > 0 ? bitDepth / 8 : 0;
  const frameBytes =
    sampleRate > 0 && channels > 0 && bytesPerSample > 0 && frameMs > 0
      ? Math.floor((sampleRate * channels * bytesPerSample * frameMs) / 1000)
      : 0;

  const toggleRule = (idx: number) => {
    setExpandedHeaderRuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleFieldChange = (
    index: number,
    key: keyof (typeof headerRules)[0],
    value: string
  ) => {
    const next = headerRules.map((r, i) =>
      i === index
        ? { ...r, [key]: key === "length" ? Number(value) || 0 : value }
        : r
    );
    onHeaderRulesChange(next);
  };

  const headerValidationErrors = useMemo(() => {
    const errors: string[] = [];
    headerRules.forEach((rule, idx) => {
      if (!rule.name.trim()) {
        errors.push(`Rule ${idx + 1}: name 不能为空`);
      }
      if (rule.length <= 0) {
        errors.push(`Rule ${idx + 1}: length 必须大于 0`);
      }
      if (!rule.rule.trim()) {
        errors.push(`Rule ${idx + 1}: rule 不能为空`);
      }
    });
    return errors;
  }, [headerRules]);

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

  const micWavePath = toSparkPath(micWaveform, 240, 44);
  const playbackWavePath = toSparkPath(playbackWaveform, 240, 44);

  return (
    <div className="wizard-step-body">
      <h2 className="wizard-step-title">4. Advanced — Audio &amp; Headers</h2>
      <p className="wizard-step-desc">
        Fine-tune audio frame parameters and configure binary header rules. For
        JSON-only or file payloads without streaming, you can skip this step.
      </p>

      {/* ── Audio Parameters ───────────────────────────── */}
      <div className="wizard-section">
        <div className="wizard-section-title">
          Audio Parameters
          <span className="wizard-source-badge">{audioParamSource}</span>
        </div>
        <div className="audio-grid">
          <label className="field">
            <span>Sample Rate</span>
            <input
              type="number"
              value={sampleRate}
              onChange={(e) => onSampleRateChange(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>Channels</span>
            <input
              type="number"
              value={channels}
              onChange={(e) => onChannelsChange(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>Bit Depth</span>
            <input
              type="number"
              value={bitDepth}
              onChange={(e) => onBitDepthChange(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>Frame ms</span>
            <input
              type="number"
              value={frameMs}
              onChange={(e) => onFrameMsChange(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>Seq Start</span>
            <input
              type="number"
              value={seqStart}
              onChange={(e) => onSeqStartChange(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>Frame Bytes</span>
            <input type="number" value={frameBytes} readOnly />
          </label>
        </div>
      </div>

      {/* ── Header Rules ───────────────────────────────── */}
      <div className="wizard-section">
        <div className="wizard-section-title">
          Header Rules ({headerRules.length})
          <span className="wizard-source-badge">{headerConfigSource}</span>
        </div>

        {headerValidationErrors.length > 0 ? (
          <div className="wizard-inline-error">
            <div>Header 规则存在 {headerValidationErrors.length} 项问题：</div>
            <ul className="wizard-error-list">
              {headerValidationErrors.map((error, idx) => (
                <li key={`${error}-${idx}`}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {headerRules.length === 0 && (
          <div className="wizard-info-block">No header rules defined. Click Add Rule to create one.</div>
        )}

        {headerRules.map((rule, idx) => {
          const isExpanded = expandedHeaderRuleIds.has(idx);
          return (
            <div key={idx} className={`header-rule-card ${isExpanded ? "expanded" : ""}`}>
              <div className="header-rule-summary" onClick={() => toggleRule(idx)}>
                <span className="header-rule-name">{rule.name || `Rule ${idx + 1}`}</span>
                <span className="header-rule-meta">{rule.type} · {rule.length}B · {rule.rule}</span>
                <span className="header-rule-toggle">{isExpanded ? "▲" : "▼"}</span>
              </div>
              {isExpanded && (
                <div className="header-rule-editor audio-grid">
                  {(["name", "type", "length", "endian", "defaultValue", "rule"] as const).map((key) => (
                    <label key={key} className="field">
                      <span>{key}</span>
                      <input
                        value={String(rule[key])}
                        onChange={(e) => handleFieldChange(idx, key, e.target.value)}
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="btn-danger-sm"
                    onClick={() => onHeaderRulesChange(headerRules.filter((_, i) => i !== idx))}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <div className="button-row" style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() =>
              onHeaderRulesChange([
                ...headerRules,
                { name: "", type: "uint8", length: 1, endian: "big", defaultValue: "0", rule: "fixed" },
              ])
            }
          >
            + Add Rule
          </button>
          <button type="button" onClick={onSaveHeaderTemplate}>
            Save Template
          </button>
        </div>

        {headerTemplates.length > 0 && (
          <div className="wizard-template-list" style={{ marginTop: 4 }}>
            {headerTemplates.map((tpl, i) => (
              <div key={i} className="wizard-template-item">
                <span className="wizard-template-name">{tpl.name}</span>
                <div className="button-row">
                  <button type="button" onClick={() => onLoadHeaderTemplate(i)}>
                    Load
                  </button>
                  <button type="button" onClick={() => onRenameHeaderTemplate(i)}>
                    Rename
                  </button>
                  <button type="button" onClick={() => onDeleteHeaderTemplate(i)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="wizard-section">
        <div className="wizard-section-title">
          Mic Monitor
          <span className="wizard-source-badge">advanced</span>
        </div>
        <div className="wizard-info-block">
          <div className="wizard-monitor-head">
            <span>
              状态：{micStreaming ? "Mic Streaming" : "Mic Stopped"} · Input Level {Math.round(
                micInputLevel * 100
              )}%
            </span>
            <button
              type="button"
              onClick={() => setShowMicMonitor((prev) => !prev)}
              className="review-issue-action"
            >
              {showMicMonitor ? "Collapse" : "Expand"}
            </button>
          </div>

          {(showMicMonitor || micStreaming) && (
            <div className="wizard-monitor-wave-grid">
              <div className="wizard-monitor-card">
                <div className="wizard-monitor-title">Mic Input Waveform</div>
                <svg viewBox="0 0 240 44" className="wizard-monitor-svg" role="img" aria-label="Mic waveform">
                  <path d={micWavePath} className="wizard-monitor-path mic" />
                </svg>
              </div>
              <div className="wizard-monitor-card">
                <div className="wizard-monitor-title">Playback Waveform</div>
                <svg viewBox="0 0 240 44" className="wizard-monitor-svg" role="img" aria-label="Playback waveform">
                  <path d={playbackWavePath} className="wizard-monitor-path playback" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="wizard-step-nav">
        <button type="button" className="btn-nav" onClick={() => setCurrentStep(3)}>
          ← Back
        </button>
        <button type="button" className="btn-nav primary" onClick={() => setCurrentStep(5)}>
          Review →
        </button>
      </div>
    </div>
  );
}
