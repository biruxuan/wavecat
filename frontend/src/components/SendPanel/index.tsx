import { useEffect, useState } from "react";
import { SendPanelContext, type SendPanelContextValue, type Props } from "../../context/SendPanelContext";
import { QuickSendBar } from "./QuickSendBar";
import { StreamConsole } from "./StreamConsole";
import { HeaderRulesPanel } from "./HeaderRulesPanel";
import { ProfileSelector } from "./ProfileSelector";
import { TranslationPanel } from "./TranslationPanel";

export function SendPanel(props: Props) {
  const { collapsed = false, onToggleCollapsed, ...rest } = props;
  const [expandedHeaderRuleIds, setExpandedHeaderRuleIds] = useState<Set<number>>(new Set());
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [compactLayout, setCompactLayout] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 700 : false
  );

  useEffect(() => {
    const onResize = () => setCompactLayout(window.innerWidth < 700);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const ctx: SendPanelContextValue = {
    ...rest,
    expandedHeaderRuleIds,
    setExpandedHeaderRuleIds,
    showTemplateManager,
    setShowTemplateManager,
  };

  return (
    <SendPanelContext.Provider value={ctx}>
      <section className="panel send-panel-cc">
        <div className="send-panel-header">
          <div className="panel-title">Send</div>
          {onToggleCollapsed && (
            <button
              type="button"
              className="connection-collapse-button"
              aria-label={collapsed ? "Expand send panel" : "Collapse send panel"}
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
        <div className={`send-body-wrap${collapsed ? " collapsed" : ""}`}>
          <div className="send-body-inner">
            {/* Top toolbar: Profile + Translation toggle */}
            <div className="cc-toolbar">
              <ProfileSelector />
            </div>

            {/* Quick JSON send bar */}
            <div className="cc-section cc-section-editor">
              <QuickSendBar />
            </div>

            {/* Translation mode (collapsible, only when active) */}
            {props.sessionProfile === "translation" && (
              <div className="cc-section">
                <TranslationPanel />
              </div>
            )}

            {/* Audio stream console */}
            <div className="cc-section cc-section-collapsible">
              <details open>
                <summary className="cc-section-header">
                  <span>Audio Stream Console</span>
                </summary>
                <StreamConsole />
              </details>
            </div>

            {/* Header rules */}
            <div className="cc-section">
              <HeaderRulesPanel />
            </div>
          </div>
        </div>
      </section>
    </SendPanelContext.Provider>
  );
}
