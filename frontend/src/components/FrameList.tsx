import React from "react";
import type { Frame } from "../types";

type Props = {
  frames: Frame[];
  selectedId: number | null;
  collapsed: boolean;
  searchText: string;
  directionFilter: string;
  typeFilter: string;
  onToggleCollapsed: () => void;
  onSelect: (id: number) => void;
  onClear: () => void;
  onSearchTextChange: (value: string) => void;
  onDirectionFilterChange: (value: string) => void;
  onTypeFilterChange: (value: string) => void;
};

export function FrameList(props: Props) {
    const formatTime = (ts: number) => {
        if (!Number.isFinite(ts) || ts <= 0) return "--:--:--";
        const d = new Date(ts);
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
    };

    const payloadPreview = (frame: Frame) => {
        const text = (frame.text && frame.text.trim()) || "";
        const ascii = (frame.ascii && frame.ascii.trim()) || "";
        const summary = (frame.summary && frame.summary.trim()) || "";
        const base64 = (frame.base64 && frame.base64.trim()) || "";
        const hex = (frame.hex && frame.hex.trim()) || "";

        if (text) return text;
        if (ascii) return ascii;
        if (summary) return summary;
        if (base64) return `[base64] ${base64.slice(0, 64)}${base64.length > 64 ? "..." : ""}`;
        if (hex) return `[hex] ${hex.slice(0, 64)}${hex.length > 64 ? "..." : ""}`;
        return "(empty payload)";
    };

    const normalizedSearch = props.searchText.trim().toLowerCase();
    const filtered = props.frames.filter((frame) => {
        if (props.directionFilter !== "all" && frame.direction !== props.directionFilter) {
            return false;
        }
        if (props.typeFilter !== "all" && frame.type !== props.typeFilter) {
            return false;
        }
        if (!normalizedSearch) {
            return true;
        }
        const haystack = [
            frame.type,
            frame.summary,
            frame.text,
            frame.ascii,
            frame.base64,
            frame.hex,
            frame.direction,
            String(frame.id),
        ]
            .filter(Boolean)
            .join("\n")
            .toLowerCase();
        return haystack.includes(normalizedSearch);
    });

    const types = Array.from(new Set(props.frames.map((f) => f.type).filter(Boolean))).sort();
    const displayFrames = [...filtered].slice(-200).reverse();

    if (props.collapsed) {
        return (
            <div style={{ padding: "12px", borderBottom: "1px solid var(--sys-outline-variant)", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={props.onToggleCollapsed}>
                <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--sys-outline)", textTransform: "uppercase" }}>FRAME LIST</div>
            </div>
        );
    }

    return (
        <section style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--sys-background)' }}>
            <div style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: '1px solid var(--sys-outline-variant)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em', textTransform: 'uppercase', color: '#fff', fontSize: '14px', fontWeight: 600 }}>
                        Frame / Response List
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                        value={props.typeFilter}
                        onChange={(e) => props.onTypeFilterChange(e.target.value)}
                        style={{ background: 'var(--sys-surface)', border: '1px solid var(--sys-outline-variant)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}
                    >
                        <option value="all">All Types</option>
                        {types.map((type) => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                    <select
                        value={props.directionFilter}
                        onChange={(e) => props.onDirectionFilterChange(e.target.value)}
                        style={{ background: 'var(--sys-surface)', border: '1px solid var(--sys-outline-variant)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}
                    >
                        <option value="all">All Dir</option>
                        <option value="in">Inbound</option>
                        <option value="out">Outbound</option>
                        <option value="system">System</option>
                    </select>
                    <input
                        type="text"
                        value={props.searchText}
                        onChange={(e) => props.onSearchTextChange(e.target.value)}
                        placeholder="Search..."
                        style={{ background: 'var(--sys-surface)', border: '1px solid var(--sys-outline-variant)', color: '#fff', padding: '4px 8px', width: '120px', borderRadius: '4px', fontSize: '12px' }}
                    />
                    <button onClick={props.onClear} style={{ background: 'transparent', border: '1px solid var(--sys-outline-variant)', color: 'var(--sys-outline)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>Clear</button>
                </div>
            </div>
            
            <div style={{ display: 'flex', padding: '8px 16px', background: 'var(--sys-surface-lowest)', borderBottom: '1px solid var(--sys-outline-variant)', fontSize: '10px', color: 'var(--sys-outline)', textTransform: 'uppercase' }}>
                <div style={{ width: '40px' }}>TYPE</div>
                <div style={{ width: '60px' }}>TIME</div>
                <div style={{ flex: 1 }}>PAYLOAD CONTENT</div>
                <div style={{ width: '80px', textAlign: 'right' }}>METRICS</div>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {displayFrames.length > 0 ? displayFrames.map((frame, i) => {
                    const isSys = frame.direction === 'system' || frame.type === 'system';
                    const isSelected = props.selectedId === frame.id;
                    const tag = frame.direction === "in" ? "IN" : frame.direction === "out" ? "OUT" : "SYS";
                    const tagColor = frame.direction === "in" ? '#00d1ff' : frame.direction === "out" ? '#f472b6' : '#a3a3a3';
                    return (
                        <div 
                            key={frame.id || i}
                            onClick={() => props.onSelect(frame.id)}
                            style={{ 
                                display: 'flex', 
                                padding: '12px 16px', 
                                borderBottom: '1px solid var(--sys-outline-variant)',
                                background: isSelected ? 'var(--sys-surface-highest)' : 'transparent',
                                cursor: 'pointer',
                                alignItems: 'flex-start',
                                gap: '8px'
                            }}
                        >
                            <div style={{ width: '40px' }}>
                                <span style={{ 
                                    background: `${tagColor}22`, 
                                    color: tagColor, 
                                    padding: '2px 4px', 
                                    borderRadius: '4px', 
                                    fontSize: '10px',
                                    fontWeight: 600
                                }}>
                                    {tag}
                                </span>
                            </div>
                            <div style={{ width: '60px', fontSize: '10px', color: 'var(--sys-outline)', fontFamily: 'monospace' }}>
                                {formatTime(frame.timestamp)}
                            </div>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{ color: '#fff', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                                    {frame.type || 'Message'}
                                </div>
                                <div style={{ color: 'var(--sys-outline)', fontSize: '10px', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {payloadPreview(frame)}
                                </div>
                            </div>
                            <div style={{ width: '80px', textAlign: 'right', fontSize: '10px', color: 'var(--sys-outline)', fontFamily: 'monospace' }}>
                                {frame.size || 0}B
                            </div>
                        </div>
                    );
                }) : (
                    <div style={{ padding: '16px', color: 'var(--sys-outline)', fontSize: '12px', textAlign: 'center' }}>
                        No frames recorded
                    </div>
                )}
            </div>
        </section>
    );
}
