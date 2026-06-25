import { useMemo, useState } from "react";
import { useSendPanelContext } from "../../context/SendPanelContext";
import type { AudioHeaderFieldRule } from "../../types";

export function HeaderRulesPanel() {
  const {
    headerRules,
    onHeaderRulesChange,
    headerConfigSource,
    headerTemplates,
    onSaveHeaderTemplate,
    onLoadHeaderTemplate,
    onRenameHeaderTemplate,
    onDeleteHeaderTemplate,
    expandedHeaderRuleIds,
    setExpandedHeaderRuleIds,
  } = useSendPanelContext();

  const [expanded, setExpanded] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const toggleRule = (idx: number) => {
    setExpandedHeaderRuleIds((prev: Set<number>) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleFieldChange = (
    index: number,
    key: keyof AudioHeaderFieldRule,
    value: string
  ) => {
    const next = headerRules.map((r: AudioHeaderFieldRule, i: number) =>
      i === index
        ? { ...r, [key]: key === "length" ? Number(value) || 0 : value }
        : r
    );
    onHeaderRulesChange(next);
  };

  const handleAddRule = () => {
    onHeaderRulesChange([
      ...headerRules,
      { name: "", type: "uint8", length: 1, endian: "big", defaultValue: "0", rule: "default" },
    ]);
    // Auto-expand the new rule
    setExpandedHeaderRuleIds((prev: Set<number>) => new Set([...prev, headerRules.length]));
    setExpanded(true);
  };

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    headerRules.forEach((rule: AudioHeaderFieldRule, idx: number) => {
      if (!rule.name.trim()) errors.push(`Rule ${idx + 1}: name required`);
      if (rule.length <= 0) errors.push(`Rule ${idx + 1}: length > 0`);
      if (!rule.rule.trim()) errors.push(`Rule ${idx + 1}: rule required`);
    });
    return errors;
  }, [headerRules]);

  // Build HEX preview
  const hexPreview = useMemo(() => {
    const parts: string[] = [];
    for (const rule of headerRules) {
      const bytes = rule.length;
      const val = Number(rule.defaultValue) || 0;
      if (rule.type === "uint8") {
        parts.push(val.toString(16).padStart(2, "0").toUpperCase());
      } else if (rule.type === "uint16") {
        const hex = val.toString(16).padStart(4, "0").toUpperCase();
        if (rule.endian === "big") {
          parts.push(hex.slice(0, 2), hex.slice(2));
        } else {
          parts.push(hex.slice(2), hex.slice(0, 2));
        }
      } else if (rule.type === "uint32") {
        const hex = val.toString(16).padStart(8, "0").toUpperCase();
        if (rule.endian === "big") {
          parts.push(hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6), hex.slice(6));
        } else {
          parts.push(hex.slice(6), hex.slice(4, 6), hex.slice(2, 4), hex.slice(0, 2));
        }
      } else {
        for (let i = 0; i < bytes; i++) parts.push("00");
      }
    }
    return parts.join(" ");
  }, [headerRules]);

  return (
    <div className="hrp-container">
      {/* Summary row (collapsed state) */}
      {!expanded && (
        <div className="hrp-summary" onClick={() => setExpanded(true)}>
          <span className="hrp-summary-text">
            {headerRules.length} field{headerRules.length !== 1 ? "s" : ""} configured
            {headerRules.length > 0 && hexPreview && (
              <span className="hrp-hex-preview"> · HEX: {hexPreview}</span>
            )}
          </span>
          {validationErrors.length > 0 && (
            <span className="hrp-error-badge">{validationErrors.length} issue{validationErrors.length !== 1 ? "s" : ""}</span>
          )}
          <span className="hrp-source-badge">{headerConfigSource}</span>
          <button type="button" className="hrp-expand-btn">
            Edit ▾
          </button>
        </div>
      )}

      {/* Expanded editor */}
      {expanded && (
        <div className="hrp-editor">
          <div className="hrp-editor-toolbar">
            <button type="button" onClick={handleAddRule}>
              + Add Rule
            </button>
            <button type="button" onClick={onSaveHeaderTemplate}>
              Save as Template
            </button>
            <div className="qsb-dropdown">
              <button
                type="button"
                className="qsb-dropdown-trigger"
                onClick={() => setShowTemplates((v) => !v)}
              >
                Presets ▾
              </button>
              {showTemplates && headerTemplates.length > 0 && (
                <div className="qsb-dropdown-menu">
                  {headerTemplates.map((t: { name: string; seqStart: number; headerRules: AudioHeaderFieldRule[] }, i: number) => (
                    <div key={i} className="hrp-template-item">
                      <button
                        type="button"
                        className="qsb-dropdown-item"
                        onClick={() => {
                          onLoadHeaderTemplate(i);
                          setShowTemplates(false);
                        }}
                      >
                        {t.name}
                      </button>
                      <button
                        type="button"
                        className="hrp-template-action"
                        title="Rename"
                        onClick={() => onRenameHeaderTemplate(i)}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="hrp-template-action"
                        title="Delete"
                        onClick={() => onDeleteHeaderTemplate(i)}
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="hrp-collapse-btn" onClick={() => setExpanded(false)}>
              ▴ Collapse
            </button>
          </div>

          {validationErrors.length > 0 && (
            <div className="hrp-errors">
              {validationErrors.map((err, i) => (
                <span key={i} className="hrp-error-item">{err}</span>
              ))}
            </div>
          )}

          {headerRules.length === 0 && (
            <div className="hrp-empty">No header rules. Click "Add Rule" to create one.</div>
          )}

          {headerRules.map((rule: AudioHeaderFieldRule, idx: number) => {
            const isExpanded = expandedHeaderRuleIds.has(idx);
            return (
              <div key={idx} className={`hrp-rule-card ${isExpanded ? "expanded" : ""}`}>
                <div className="hrp-rule-summary" onClick={() => toggleRule(idx)}>
                  <span className="hrp-rule-name">{rule.name || `Rule ${idx + 1}`}</span>
                  <span className="hrp-rule-meta">
                    {rule.type} · {rule.length}B · {rule.rule}
                  </span>
                  <button
                    type="button"
                    className="hrp-rule-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      onHeaderRulesChange(headerRules.filter((_: AudioHeaderFieldRule, i: number) => i !== idx));
                    }}
                    title="Remove rule"
                  >
                    ×
                  </button>
                  <span className="hrp-rule-toggle">{isExpanded ? "▲" : "▼"}</span>
                </div>
                {isExpanded && (
                  <div className="hrp-rule-fields">
                    {(["name", "type", "length", "endian", "defaultValue", "rule"] as const).map((key) => (
                      <label key={key} className="hrp-field">
                        <span>{key}</span>
                        <input
                          value={String(rule[key])}
                          onChange={(e) => handleFieldChange(idx, key, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* HEX preview */}
          {headerRules.length > 0 && (
            <div className="hrp-hex-bar">
              <span className="hrp-hex-label">HEX Preview:</span>
              <code className="hrp-hex-value">{hexPreview || "(empty)"}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
