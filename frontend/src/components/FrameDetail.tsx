import { useEffect, useMemo, useState } from "react";
import type { Frame } from "../types";

type Props = {
    frame: Frame | null | undefined;
    collapsed: boolean;
    onToggleCollapsed: () => void;
};

type PayloadMode = "hex" | "base64" | "ascii" | "text" | "summary";

const T = {
    bg: "var(--sys-background)",
    surface: "var(--sys-surface-lowest)",
    border: "var(--sys-outline-variant)",
    title: "#fff",
    dim: "var(--sys-outline)",
};

function formatTimestamp(timestamp: number): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return "-";
    }
    return new Date(timestamp).toLocaleString();
}

function hasModePayload(frame: Frame, mode: PayloadMode): boolean {
    switch (mode) {
        case "hex":
            return Boolean(frame.hex && frame.hex.trim());
        case "base64":
            return Boolean(frame.base64 && frame.base64.trim());
        case "ascii":
            return Boolean(frame.ascii && frame.ascii.trim());
        case "text":
            return Boolean(frame.text && frame.text.trim());
        case "summary":
            return Boolean(frame.summary && frame.summary.trim());
        default:
            return false;
    }
}

function payloadByMode(frame: Frame, mode: PayloadMode): string {
    if (mode === "hex") {
        return frame.hex?.trim() || "(hex payload unavailable)";
    }
    if (mode === "base64") {
        return frame.base64?.trim() || "(base64 payload unavailable)";
    }
    if (mode === "ascii") {
        return frame.ascii?.trim() || "(ascii payload unavailable)";
    }
    if (mode === "summary") {
        return frame.summary?.trim() || "(summary payload unavailable)";
    }

    const text = frame.text?.trim() || "";
    if (!text) {
        return "(text payload unavailable)";
    }
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        return text;
    }
}

export function FrameDetail(props: Props) {
    const [payloadMode, setPayloadMode] = useState<PayloadMode>("hex");

    useEffect(() => {
        if (!props.frame) {
            setPayloadMode("hex");
            return;
        }

        const priority: PayloadMode[] = ["hex", "base64", "ascii", "text", "summary"];
        const preferred = priority.find((mode) => hasModePayload(props.frame as Frame, mode));
        setPayloadMode(preferred || "hex");
    }, [props.frame?.id]);

    const payloadText = useMemo(() => {
        if (!props.frame) return "";
        return payloadByMode(props.frame, payloadMode);
    }, [props.frame, payloadMode]);

    if (props.collapsed) {
        return (
            <div
                style={{
                    padding: "12px",
                    borderTop: `1px solid ${T.border}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                }}
                onClick={props.onToggleCollapsed}
            >
                <div style={{ fontWeight: 600, fontSize: "14px", color: T.dim, textTransform: "uppercase" }}>DETAILS</div>
            </div>
        );
    }

    return (
        <section
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                background: T.bg,
                borderTop: `1px solid ${T.border}`,
            }}
        >
            <div
                style={{
                    padding: "16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: `1px solid ${T.border}`,
                }}
            >
                <div
                    style={{
                        fontFamily: "var(--font-display)",
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        color: T.title,
                        fontSize: "14px",
                        fontWeight: 600,
                    }}
                >
                    Details
                </div>
            </div>

            <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
                {props.frame ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div
                            style={{
                                background: T.surface,
                                padding: "12px",
                                borderRadius: "4px",
                                border: `1px solid ${T.border}`,
                                fontFamily: "monospace",
                                fontSize: "12px",
                                lineHeight: "1.5",
                            }}
                        >
                            <div style={{ color: T.dim }}>
                                id: <span style={{ color: T.title }}>{props.frame.id}</span>
                            </div>
                            <div style={{ color: T.dim }}>
                                direction: <span style={{ color: T.title }}>{props.frame.direction}</span>
                            </div>
                            <div style={{ color: T.dim }}>
                                type: <span style={{ color: T.title }}>{props.frame.type || "-"}</span>
                            </div>
                            <div style={{ color: T.dim }}>
                                timestamp: <span style={{ color: T.title }}>{formatTimestamp(props.frame.timestamp)}</span>
                            </div>
                            <div style={{ color: T.dim }}>
                                size: <span style={{ color: T.title }}>{props.frame.size || 0} bytes</span>
                            </div>
                            <div style={{ color: T.dim }}>
                                payload source:
                                <select
                                    value={payloadMode}
                                    onChange={(e) => setPayloadMode(e.target.value as PayloadMode)}
                                    style={{
                                        marginLeft: "8px",
                                        background: "var(--sys-surface)",
                                        border: `1px solid ${T.border}`,
                                        color: T.title,
                                        borderRadius: "4px",
                                        padding: "2px 6px",
                                        fontFamily: "monospace",
                                        fontSize: "12px",
                                    }}
                                >
                                    <option value="hex">hex</option>
                                    <option value="base64">base64</option>
                                    <option value="ascii">ascii</option>
                                    <option value="text">text</option>
                                    <option value="summary">summary</option>
                                </select>
                            </div>
                        </div>

                        <div
                            style={{
                                background: T.surface,
                                padding: "12px",
                                borderRadius: "4px",
                                border: `1px solid ${T.border}`,
                                fontFamily: "monospace",
                                fontSize: "12px",
                                lineHeight: "1.5",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-all",
                                color: T.title,
                            }}
                        >
                            {payloadText}
                        </div>
                    </div>
                ) : (
                    <div
                        style={{
                            background: T.surface,
                            padding: "16px",
                            borderRadius: "4px",
                            border: `1px solid ${T.border}`,
                            fontFamily: "monospace",
                            fontSize: "12px",
                            lineHeight: "1.5",
                            color: T.dim,
                        }}
                    >
                        Select a frame to view details
                    </div>
                )}
            </div>
        </section>
    );
}
