import { useSendPanelContext } from "../../../context/SendPanelContext";

const MODES = [
  {
    value: "chat" as const,
    label: "Chat Mode",
    description:
      "Standard bidirectional communication. No source/target language configuration required.",
  },
  {
    value: "translation" as const,
    label: "Translation Mode",
    description:
      "Real-time translation stream. From/To languages must be configured in the next steps.",
  },
];

export function StepMode() {
  const {
    sessionProfile,
    onSessionProfileChange,
    translationFromLanguage,
    translationToLanguagesText,
    onTranslationFromLanguageChange,
    onTranslationToLanguagesChange,
    onApplyTranslationLanguagePreset,
    setCurrentStep,
  } = useSendPanelContext();

  return (
    <div className="wizard-step-body">
      <h2 className="wizard-step-title">1. Select Session Mode</h2>
      <p className="wizard-step-desc">
        Choose the interaction mode. This affects required payloads and available
        start templates.
      </p>

      <div className="wizard-card-grid">
        {MODES.map(({ value, label, description }) => (
          <div
            key={value}
            className={`wizard-card ${sessionProfile === value ? "active" : ""}`}
            onClick={() => onSessionProfileChange(value)}
          >
            <div className="wizard-card-header">
              <strong>{label}</strong>
            </div>
            <p className="wizard-card-desc">{description}</p>
          </div>
        ))}
      </div>

      {sessionProfile === "translation" && (
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
      )}

      <div className="wizard-step-nav">
        <span />
        <button type="button" className="btn-nav primary" onClick={() => setCurrentStep(2)}>
          Next →
        </button>
      </div>
    </div>
  );
}
