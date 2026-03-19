import { useEffect, useMemo, useState } from "react";
import type { Frame } from "../types";

type Props = {
  frame?: Frame;
};

type TabKey = "summary" | "text" | "hex" | "ascii" | "base64";

export function FrameDetail({ frame }: Props) {
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
    setActiveTab(availableTabs[0] ?? "summary");
    setCopyText("Copy");
  }, [availableTabs, frame?.id]);

  if (!frame) {
    return (
      <section className="panel frame-detail-panel">
        <div className="panel-title">Frame Detail</div>
        <div className="placeholder">Select a frame to inspect details.</div>
      </section>
    );
  }

  const contentByTab: Record<TabKey, string> = {
    summary: frame.summary,
    text: frame.text ?? "",
    hex: frame.hex ?? "",
    ascii: frame.ascii ?? "",
    base64: frame.base64 ?? "",
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
      <div className="panel-header">
        <div className="panel-title">Frame Detail</div>
        <button type="button" onClick={handleCopy} disabled={!currentContent}>
          {copyText}
        </button>
      </div>
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
    </section>
  );
}
