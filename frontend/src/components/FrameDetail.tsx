import { useEffect, useMemo, useState } from "react";
import type { Frame } from "../types";

type Props = {
  frame?: Frame;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

type TabKey = "summary" | "text" | "hex" | "ascii" | "base64";

export function FrameDetail({ frame, collapsed, onToggleCollapsed }: Props) {
  const availableTabs = useMemo(() => {
    if (!frame) {
      return ["summary"] as TabKey[];
    }

    const tabs: TabKey[] = ["summary"];
    if (frame.text) tabs.push("text");
    if (frame.hex) tabs.push("hex");
    if (frame.ascii) tabs.push("ascii");
    if (frame.base64) tabs.push("base64");
    return tabs;
  }, [frame]);

  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [copyText, setCopyText] = useState("Copy");

  useEffect(() => {
    const prefersTextTab = frame?.type === "text" && availableTabs.includes("text");
    setActiveTab(prefersTextTab ? "text" : availableTabs[0] ?? "summary");
    setCopyText("Copy");
  }, [availableTabs, frame?.id]);

  const contentByTab: Record<TabKey, string> = {
    summary: frame?.summary ?? "",
    text: frame?.text ?? "",
    hex: frame?.hex ?? "",
    ascii: frame?.ascii ?? "",
    base64: frame?.base64 ?? "",
  };

  const currentContent = contentByTab[activeTab] ?? "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentContent);
      setCopyText("Copied");
      window.setTimeout(() => setCopyText("Copy"), 1200);
    } catch {
      setCopyText("Copy failed");
      window.setTimeout(() => setCopyText("Copy"), 1200);
    }
  };

  return (
    <section className="panel frame-detail-panel">
      <div className="frame-detail-panel-header">
        <div className="panel-title">Frame Detail</div>
        <div className="frame-detail-actions">
          {frame && (
            <button type="button" onClick={handleCopy} disabled={!currentContent}>
              {copyText}
            </button>
          )}
        </div>
        <button
          type="button"
          className="connection-collapse-button"
          aria-label={collapsed ? "Expand frame detail" : "Collapse frame detail"}
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
      </div>
      <div className={`frame-detail-body-wrap${collapsed ? " collapsed" : ""}`}>
        <div className="frame-detail-body-inner">
          {!frame ? (
            <div className="placeholder">Select a frame to inspect details.</div>
          ) : (
            <>
              <div className="detail-meta">
                <span>ID: {frame.id}</span>
                <span>Type: {frame.type}</span>
                <span>Direction: {frame.direction}</span>
                <span>Size: {frame.size}</span>
              </div>
              {frame.error ? <div className="error-box">{frame.error}</div> : null}
              <div className="tab-row">
                {availableTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={activeTab === tab ? "tab-button active" : "tab-button"}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>
              <pre>{currentContent || "No data"}</pre>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
