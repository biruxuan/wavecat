import { useSendPanelContext } from "../../context/SendPanelContext";

export function TranslationPanel() {
  const {
    translationFromLanguage,
    translationToLanguagesText,
    onTranslationFromLanguageChange,
    onTranslationToLanguagesChange,
    onApplyTranslationLanguagePreset,
  } = useSendPanelContext();

  return (
    <div className="tp-container">
      <div className="tp-fields">
        <label className="tp-field">
          <span>From Language</span>
          <input
            value={translationFromLanguage}
            onChange={(e) => onTranslationFromLanguageChange(e.target.value)}
            placeholder="zh-CN"
          />
        </label>
        <label className="tp-field">
          <span>To Languages</span>
          <input
            value={translationToLanguagesText}
            onChange={(e) => onTranslationToLanguagesChange(e.target.value)}
            placeholder="en-US, ja-JP"
          />
        </label>
      </div>
      <div className="tp-presets">
        <button type="button" onClick={() => onApplyTranslationLanguagePreset("zh-CN", ["en-US"])} title="Chinese → English">
          zh → en
        </button>
        <button type="button" onClick={() => onApplyTranslationLanguagePreset("zh-CN", ["ja-JP"])} title="Chinese → Japanese">
          zh → ja
        </button>
        <button type="button" onClick={() => onApplyTranslationLanguagePreset("en-US", ["zh-CN"])} title="English → Chinese">
          en → zh
        </button>
        <button type="button" onClick={() => onApplyTranslationLanguagePreset("zh-CN", ["ko-KR"])} title="Chinese → Korean">
          zh → ko
        </button>
      </div>
    </div>
  );
}
